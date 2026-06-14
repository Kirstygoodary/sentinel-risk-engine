import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { TIER_HOLD_DAYS } from '../risk-engine/decide-tier';
import { RiskDecision } from '../risk-engine/risk-engine.types';

const DAY_MS = 24 * 60 * 60 * 1000;

const available = (accountId: string) => `account:${accountId}:available`;
const escrow = (accountId: string) => `account:${accountId}:escrow`;

/**
 * Adaptive escrow — turns a risk verdict into a graduated, reversible hold,
 * releases matured holds on a schedule (unless the account is paused), and
 * reverses holds on a confirmed bad outcome.
 *
 * Shadow mode (RISK_SHADOW_MODE=true): the verdict is still recorded upstream,
 * but escrow does NOT move money — the safe calibration posture before enforcing.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService,
  ) {}

  private get shadow(): boolean {
    return this.config.get('RISK_SHADOW_MODE', 'true') !== 'false';
  }

  /** Create a hold for a scored transaction, sized by its tier. */
  async holdForDecision(transactionId: string, decision: RiskDecision): Promise<void> {
    const tx = await this.prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    const holdDays = TIER_HOLD_DAYS[decision.tier];
    const releaseAt = new Date(Date.now() + holdDays * DAY_MS);

    if (this.shadow) {
      this.logger.log(
        `[shadow] would hold tx ${transactionId} tier=${decision.tier} for ${holdDays}d`,
      );
      return;
    }

    await this.prisma.escrowHold.create({
      data: {
        accountId: tx.accountId,
        transactionId,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        status: 'HELD',
        tier: decision.tier,
        holdDays,
        releaseAt,
      },
    });

    // Move the funds available → escrow.
    await this.ledger.post({
      groupId: `hold:${transactionId}`,
      currency: tx.currency,
      reason: 'HOLD',
      legs: [
        { bucket: available(tx.accountId), direction: 'DEBIT', amountMinor: tx.amountMinor },
        { bucket: escrow(tx.accountId), direction: 'CREDIT', amountMinor: tx.amountMinor },
      ],
    });
  }

  /**
   * Release holds whose releaseAt has passed — UNLESS the account is paused.
   * Runs every minute. Idempotent: only HELD holds are touched.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async releaseMaturedHolds(): Promise<void> {
    const due = await this.prisma.escrowHold.findMany({
      where: { status: 'HELD', releaseAt: { lte: new Date() } },
    });

    for (const hold of due) {
      const paused = await this.prisma.accountPause.findFirst({
        where: { accountId: hold.accountId, active: true },
      });
      if (paused) {
        this.logger.log(`hold ${hold.id} matured but account ${hold.accountId} is paused — skip`);
        continue;
      }
      await this.releaseHold(hold.id);
    }
  }

  /** Move one hold's funds escrow → available and mark it RELEASED. */
  async releaseHold(holdId: string): Promise<void> {
    const hold = await this.prisma.escrowHold.findUniqueOrThrow({ where: { id: holdId } });
    if (hold.status !== 'HELD') return; // idempotent

    await this.ledger.post({
      groupId: `release:${hold.id}`,
      currency: hold.currency,
      reason: 'RELEASE',
      legs: [
        { bucket: escrow(hold.accountId), direction: 'DEBIT', amountMinor: hold.amountMinor },
        { bucket: available(hold.accountId), direction: 'CREDIT', amountMinor: hold.amountMinor },
      ],
    });
    await this.prisma.escrowHold.update({
      where: { id: hold.id },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
  }

  /**
   * Reverse a hold on a confirmed bad outcome (chargeback while still held) —
   * the "reversible" half of graduated enforcement. Funds never reach the
   * account; the hold is cancelled and the original posting reversed.
   */
  async reverseHold(holdId: string): Promise<void> {
    const hold = await this.prisma.escrowHold.findUniqueOrThrow({ where: { id: holdId } });
    if (hold.status !== 'HELD') return; // only an active hold can be reversed

    await this.ledger.post({
      groupId: `cancel:${hold.id}`,
      currency: hold.currency,
      reason: 'CANCEL',
      legs: [
        // unwind the hold: escrow → available (funds returned to source, not paid out)
        { bucket: escrow(hold.accountId), direction: 'DEBIT', amountMinor: hold.amountMinor },
        { bucket: available(hold.accountId), direction: 'CREDIT', amountMinor: hold.amountMinor },
      ],
    });
    await this.prisma.escrowHold.update({
      where: { id: hold.id },
      data: { status: 'CANCELLED' },
    });
  }
}
