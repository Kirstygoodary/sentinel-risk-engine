import { scoreBayesian } from './bayesian';

describe('scoreBayesian', () => {
  it('a fresh account with no history is CLEAR (prior is low-risk)', () => {
    const r = scoreBayesian({ chargebacks: 0, lateChargebacks: 0, clearedVolumeMajor: 0 });
    expect(r.tier).toBe('CLEAR');
    expect(r.autoPause).toBeFalsy();
  });

  it('a long clean history stays CLEAR (trust keeps risk low)', () => {
    const r = scoreBayesian({ chargebacks: 0, lateChargebacks: 0, clearedVolumeMajor: 50000 });
    expect(r.tier).toBe('CLEAR');
  });

  it('a single isolated chargeback is NOT penalised (disputes are noisy)', () => {
    // Deliberate design: one chargeback can be a legit dispute / buyer-side
    // friendly fraud. We act on PATTERNS, not a single event — the guardrail
    // layer handles "losses are mounting". One CB on a new account → CLEAR.
    const one = scoreBayesian({ chargebacks: 1, lateChargebacks: 0, clearedVolumeMajor: 0 });
    expect(one.tier).toBe('CLEAR');
  });

  it('repeated chargebacks (a pattern) push risk up the tiers', () => {
    const many = scoreBayesian({ chargebacks: 4, lateChargebacks: 0, clearedVolumeMajor: 0 });
    expect(many.tier === 'T3' || many.tier === 'T2').toBe(true);
  });

  it('late chargebacks weigh more than in-window ones', () => {
    const inWindow = scoreBayesian({ chargebacks: 2, lateChargebacks: 0, clearedVolumeMajor: 0 });
    const late = scoreBayesian({ chargebacks: 0, lateChargebacks: 2, clearedVolumeMajor: 0 });
    // compare the actual posterior probabilities, not the formatted strings
    const p = (r: { detail?: string }) => Number(r.detail!.replace('p=', ''));
    expect(p(late)).toBeGreaterThan(p(inWindow));
  });

  it('auto-pauses an account whose risk crosses the threshold', () => {
    const r = scoreBayesian({ chargebacks: 5, lateChargebacks: 3, clearedVolumeMajor: 0 });
    expect(r.autoPause).toBe(true);
  });

  it('trust is capped — clean volume cannot fully wash out heavy chargeback history', () => {
    const r = scoreBayesian({ chargebacks: 5, lateChargebacks: 3, clearedVolumeMajor: 10_000_000 });
    // even with huge clean volume, serious CB history can't drop to CLEAR
    expect(r.tier).not.toBe('CLEAR');
  });

  it('never leaks anything but a rounded probability in detail', () => {
    const r = scoreBayesian({ chargebacks: 1, lateChargebacks: 0, clearedVolumeMajor: 0 });
    expect(r.detail).toMatch(/^p=\d\.\d\d$/);
  });
});
