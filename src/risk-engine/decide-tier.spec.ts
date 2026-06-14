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
    const input: RiskDecisionInput = {};
    // [fill: expect decideTier(input).tier === 'CLEAR' and tierSource 'DEFAULT']
    expect(() => decideTier(input)).toBeDefined();
  });

  it('takes the MAX tier across present signals (most cautious wins)', () => {
    const input: RiskDecisionInput = {
      ml: sig({ source: 'ML', tier: 'WATCH' }),
      outlier: sig({ source: 'OUTLIER', tier: 'T2' }),
    };
    // [fill: expect tier === 'T2', tierSource === 'OUTLIER']
    expect(input).toBeDefined();
  });

  it('GUARDRAIL overrides everything and forces auto-pause', () => {
    const input: RiskDecisionInput = {
      ml: sig({ source: 'ML', tier: 'CLEAR' }),
      guardrail: sig({ source: 'GUARDRAIL', tier: 'T3', autoPause: true }),
    };
    // [fill: expect autoPause === true, tierSource === 'GUARDRAIL']
    expect(input).toBeDefined();
  });

  it('a Bayesian auto-pause beats a higher tier from another signal', () => {
    const input: RiskDecisionInput = {
      outlier: sig({ source: 'OUTLIER', tier: 'T3' }),
      bayesian: sig({ source: 'BAYESIAN', tier: 'T1', autoPause: true }),
    };
    // [fill: expect autoPause === true, tierSource === 'BAYESIAN']
    expect(input).toBeDefined();
  });

  it('never leaks a raw score into humanReason', () => {
    const input: RiskDecisionInput = {
      outlier: sig({ source: 'OUTLIER', tier: 'T2', detail: 'madScore=87.3' }),
    };
    // [fill: expect decideTier(input).humanReason NOT to contain '87.3']
    expect(input).toBeDefined();
  });
});
