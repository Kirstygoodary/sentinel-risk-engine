import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** One leg of a posting. */
export interface LedgerLeg {
  bucket: string;
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: bigint;
}

export interface LedgerPosting {
  groupId: string;
  currency: string;
  reason: string; // HOLD / RELEASE / CANCEL / PAYOUT
  legs: LedgerLeg[];
}

/**
 * Double-entry ledger — the auditable money path.
 *
 * Every movement is a set of legs whose debits and credits MUST balance; we
 * refuse to write an unbalanced posting. Balances are never stored as a column —
 * they are DERIVED by summing entries. This is what makes every figure provable
 * and every escrow action reversible (a reversal is just an equal-and-opposite
 * posting, not a destructive edit).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write a balanced posting in a single transaction. Throws if unbalanced. */
  async post(posting: LedgerPosting): Promise<void> {
    const debits = sum(posting.legs.filter((l) => l.direction === 'DEBIT'));
    const credits = sum(posting.legs.filter((l) => l.direction === 'CREDIT'));

    if (debits !== credits) {
      throw new BadRequestException(
        `Unbalanced ledger posting (${posting.reason}): debits ${debits} != credits ${credits}`,
      );
    }
    if (posting.legs.length < 2) {
      throw new BadRequestException('A ledger posting needs at least two legs');
    }

    await this.prisma.ledgerEntry.createMany({
      data: posting.legs.map((leg) => ({
        groupId: posting.groupId,
        bucket: leg.bucket,
        direction: leg.direction,
        amountMinor: leg.amountMinor,
        currency: posting.currency,
        reason: posting.reason,
      })),
    });
  }

  /** Derived balance of a bucket = sum(credits) - sum(debits). */
  async balanceOf(bucket: string): Promise<bigint> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { bucket },
      select: { direction: true, amountMinor: true },
    });
    return entries.reduce(
      (acc, e) => (e.direction === 'CREDIT' ? acc + e.amountMinor : acc - e.amountMinor),
      0n,
    );
  }
}

function sum(legs: LedgerLeg[]): bigint {
  return legs.reduce((acc, l) => acc + l.amountMinor, 0n);
}
