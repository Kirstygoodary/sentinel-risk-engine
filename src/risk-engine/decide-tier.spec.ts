import { decideTier } from './decide-tier';
import { RiskDecisionInput, SignalResult } from './risk-engine.types';

/**
 * Tests for the decision engine. This file is the PATTERN to copy for the rest
 * of the suite. Because decideTier is a pure function, every rule is a one-line
 * arrange/act/assert — exactly what a reviewer wants to see on risk logic.
 *
 * These tests are written to describe the BEHAVIOUR you'll implement; fill the
 * expected values once decideTier is done. Each `it` pins one rule of the model
 * so a future change that breaks the override ordering fails loudly.
 */

const sig = (over: Partial<SignalResult>): SignalResult => ({
  source: 'OUTLIER',
  tier: 'CLEAR',
  ...over,
});

describe('decideTier', () => {
  it('returns CLEAR/DEFAULT when no signals are present', () => {
    const decision = decideTier({});
    expect(decision.tier).toBe('CLEAR');
    expect(decision.tierSource).toBe('DEFAULT');
    expect(decision.autoPause).toBe(false);
  });

  it('takes the MAX tier across present signals (most cautious wins)', () => {
    const decision = decideTier({
      ml: sig({ source: 'ML', tier: 'WATCH' }),
      outlier: sig({ source: 'OUTLIER', tier: 'T2' }),
    });
    expect(decision.tier).toBe('T2');
    expect(decision.tierSource).toBe('OUTLIER');
    expect(decision.autoPause).toBe(false);
  });

  it('GUARDRAIL overrides everything and forces auto-pause', () => {
    const decision = decideTier({
      ml: sig({ source: 'ML', tier: 'CLEAR' }),
      guardrail: sig({ source: 'GUARDRAIL', tier: 'T3', autoPause: true }),
    });
    expect(decision.autoPause).toBe(true);
    expect(decision.tierSource).toBe('GUARDRAIL');
  });

  it('a Bayesian auto-pause beats a higher tier from another signal', () => {
    const decision = decideTier({
      outlier: sig({ source: 'OUTLIER', tier: 'T3' }),
      bayesian: sig({ source: 'BAYESIAN', tier: 'T1', autoPause: true }),
    });
    expect(decision.autoPause).toBe(true);
    expect(decision.tierSource).toBe('BAYESIAN');
  });

  it('never leaks a raw score into humanReason', () => {
    const decision = decideTier({
      outlier: sig({ source: 'OUTLIER', tier: 'T2', detail: 'madScore=87.3' }),
    });
    expect(decision.humanReason).not.toContain('87.3');
  });
});
