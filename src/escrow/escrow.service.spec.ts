import { EscrowService } from './escrow.service';
import { PrismaService } from '../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { ConfigService } from '@nestjs/config';
import { RiskDecision } from '../risk-engine/risk-engine.types';

/**
 * Escrow lifecycle tests. Prisma + Ledger are mocked so these assert the
 * BEHAVIOUR — shadow-mode safety, the pause-skip on release, reversal — without
 * a database. The behaviours tested here are the ones that protect money.
 */
describe('EscrowService', () => {
  let prisma: any;
  let ledger: { post: jest.Mock; balanceOf: jest.Mock };
  let config: { get: jest.Mock };

  const makeService = (shadow: boolean) => {
    config = { get: jest.fn().mockReturnValue(shadow ? 'true' : 'false') };
    return new EscrowService(
      prisma as PrismaService,
      ledger as unknown as LedgerService,
      config as unknown as ConfigService,
    );
  };

  const decision: RiskDecision = {
    tier: 'T2',
    tierSource: 'OUTLIER',
    autoPause: false,
    reasonCode: 'OUTLIER_T2',
    humanReason: 'extended review',
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'tx1', accountId: 'a1', amountMinor: 5000n, currency: 'GBP' }),
      },
      escrowHold: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      accountPause: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    ledger = { post: jest.fn().mockResolvedValue(undefined), balanceOf: jest.fn() };
  });

  it('SHADOW mode records nothing and moves no money', async () => {
    const svc = makeService(true);
    await svc.holdForDecision('tx1', decision);
    expect(prisma.escrowHold.create).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('enforcing mode creates a hold and posts available→escrow', async () => {
    const svc = makeService(false);
    await svc.holdForDecision('tx1', decision);
    expect(prisma.escrowHold.create).toHaveBeenCalledTimes(1);
    expect(ledger.post).toHaveBeenCalledTimes(1);
    expect(ledger.post.mock.calls[0][0].reason).toBe('HOLD');
  });

  it('does NOT release a matured hold when the account is paused', async () => {
    const svc = makeService(false);
    prisma.escrowHold.findMany.mockResolvedValue([
      { id: 'h1', accountId: 'a1', amountMinor: 5000n, currency: 'GBP', status: 'HELD' },
    ]);
    prisma.accountPause.findFirst.mockResolvedValue({ id: 'p1', active: true });

    await svc.releaseMaturedHolds();
    expect(ledger.post).not.toHaveBeenCalled(); // skipped — money stays held
    expect(prisma.escrowHold.update).not.toHaveBeenCalled();
  });

  it('releases a matured hold (escrow→available) when not paused', async () => {
    const svc = makeService(false);
    const hold = { id: 'h1', accountId: 'a1', amountMinor: 5000n, currency: 'GBP', status: 'HELD' };
    prisma.escrowHold.findMany.mockResolvedValue([hold]);
    prisma.escrowHold.findUniqueOrThrow.mockResolvedValue(hold);

    await svc.releaseMaturedHolds();
    expect(ledger.post.mock.calls[0][0].reason).toBe('RELEASE');
    expect(prisma.escrowHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RELEASED' }) }),
    );
  });

  it('reverseHold cancels an active hold and unwinds the funds', async () => {
    const svc = makeService(false);
    prisma.escrowHold.findUniqueOrThrow.mockResolvedValue({
      id: 'h1', accountId: 'a1', amountMinor: 5000n, currency: 'GBP', status: 'HELD',
    });
    await svc.reverseHold('h1');
    expect(ledger.post.mock.calls[0][0].reason).toBe('CANCEL');
    expect(prisma.escrowHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    );
  });

  it('release is idempotent — a non-HELD hold is left alone', async () => {
    const svc = makeService(false);
    prisma.escrowHold.findUniqueOrThrow.mockResolvedValue({
      id: 'h1', accountId: 'a1', amountMinor: 5000n, currency: 'GBP', status: 'RELEASED',
    });
    await svc.releaseHold('h1');
    expect(ledger.post).not.toHaveBeenCalled();
  });
});
