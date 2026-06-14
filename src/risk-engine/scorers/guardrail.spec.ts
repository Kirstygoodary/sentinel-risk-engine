import { scoreGuardrail } from './guardrail';

describe('scoreGuardrail', () => {
  it('does not fire when there are no realized losses', () => {
    expect(scoreGuardrail({ realizedLossMinor: 0, lateChargebacks: 0 })).toBeUndefined();
  });

  it('does not fire on a single large loss without a late-CB pattern', () => {
    // one big legit dispute shouldn't trip the backstop
    expect(scoreGuardrail({ realizedLossMinor: 50_000, lateChargebacks: 1 })).toBeUndefined();
  });

  it('does not fire on a late-CB pattern below the loss threshold', () => {
    expect(scoreGuardrail({ realizedLossMinor: 500, lateChargebacks: 3 })).toBeUndefined();
  });

  it('fires (auto-pause, T3) when losses AND a late-CB pattern both cross', () => {
    const r = scoreGuardrail({ realizedLossMinor: 50_000, lateChargebacks: 2 });
    expect(r?.tier).toBe('T3');
    expect(r?.autoPause).toBe(true);
    expect(r?.source).toBe('GUARDRAIL');
  });

  it('never exposes the loss amount in detail (count only)', () => {
    const r = scoreGuardrail({ realizedLossMinor: 50_000, lateChargebacks: 2 });
    expect(r?.detail).not.toContain('50');
  });
});
