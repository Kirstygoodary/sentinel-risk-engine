import { BadRequestException } from '@nestjs/common';
import { LedgerService, LedgerPosting } from './ledger.service';
import { PrismaService } from '../common/prisma.service';

/**
 * The ledger's correctness is the single most important property in a money
 * system, so it's tested directly. Prisma is mocked — these tests assert the
 * INVARIANTS (balanced postings, derived balances) without needing a database,
 * so they run in CI.
 */
describe('LedgerService', () => {
  let prisma: { ledgerEntry: { createMany: jest.Mock; findMany: jest.Mock } };
  let ledger: LedgerService;

  beforeEach(() => {
    prisma = {
      ledgerEntry: { createMany: jest.fn().mockResolvedValue({ count: 2 }), findMany: jest.fn() },
    };
    ledger = new LedgerService(prisma as unknown as PrismaService);
  });

  const balanced: LedgerPosting = {
    groupId: 'g1',
    currency: 'GBP',
    reason: 'HOLD',
    legs: [
      { bucket: 'acct:1:available', direction: 'DEBIT', amountMinor: 5000n },
      { bucket: 'acct:1:escrow', direction: 'CREDIT', amountMinor: 5000n },
    ],
  };

  it('writes a balanced posting', async () => {
    await expect(ledger.post(balanced)).resolves.toBeUndefined();
    expect(prisma.ledgerEntry.createMany).toHaveBeenCalledTimes(1);
  });

  it('REFUSES an unbalanced posting (debits != credits)', async () => {
    const bad: LedgerPosting = {
      ...balanced,
      legs: [
        { bucket: 'acct:1:available', direction: 'DEBIT', amountMinor: 5000n },
        { bucket: 'acct:1:escrow', direction: 'CREDIT', amountMinor: 4000n },
      ],
    };
    await expect(ledger.post(bad)).rejects.toThrow(BadRequestException);
    expect(prisma.ledgerEntry.createMany).not.toHaveBeenCalled(); // nothing written
  });

  it('refuses a single-leg posting', async () => {
    const bad: LedgerPosting = {
      ...balanced,
      legs: [{ bucket: 'acct:1:available', direction: 'DEBIT', amountMinor: 5000n }],
    };
    await expect(ledger.post(bad)).rejects.toThrow(BadRequestException);
  });

  it('derives a balance as credits minus debits', async () => {
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { direction: 'CREDIT', amountMinor: 5000n },
      { direction: 'CREDIT', amountMinor: 2000n },
      { direction: 'DEBIT', amountMinor: 3000n },
    ]);
    await expect(ledger.balanceOf('acct:1:escrow')).resolves.toBe(4000n);
  });
});
