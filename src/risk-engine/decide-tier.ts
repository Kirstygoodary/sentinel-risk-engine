import { RiskDecision, RiskDecisionInput, RiskTier } from './risk-engine.types';

/**
 * The decision engine — combine the four signals into one verdict.
 *
 * PURE FUNCTION: no DB, no I/O, no clock. Inputs in → decision out. This is what
 * makes the riskiest part of the system exhaustively testable, and it's the file
 * a reviewer will read first. Own every line.
 *
 * [fill: implement the override-ordered combination. The model you'll defend:
 *   1. GUARDRAIL is a hard tripwire — if it fired, it wins (auto-pause), full stop.
 *   2. Otherwise, if any signal demands auto-pause (e.g. Bayesian over threshold),
 *      that wins.
 *   3. Otherwise, take the MAX tier across the present signals (most cautious
 *      wins), and record which source drove it.
 *   4. No signals / all CLEAR → CLEAR / DEFAULT.
 *  Then map the winning (source, tier) to a human-readable reason via a small
 *  lookup — never leak raw scores. Re-derive your own ordering rationale; be
 *  ready to explain WHY guardrail beats Bayesian beats max-of-rest.]
 */

const TIER_RANK: Record<RiskTier, number> = {
  CLEAR: 0,
  WATCH: 1,
  T1: 2,
  T2: 3,
  T3: 4,
};

export function decideTier(input: RiskDecisionInput): RiskDecision {
  // [fill: the logic described above, using TIER_RANK to compare tiers.]
  throw new Error('decideTier: [fill] not implemented');
}

/** Tier → hold duration in days. [fill: re-derive your own ladder + rationale.] */
export const TIER_HOLD_DAYS: Record<RiskTier, number> = {
  CLEAR: 0, // [fill]
  WATCH: 0, // [fill]
  T1: 0, // [fill]
  T2: 0, // [fill]
  T3: 0, // [fill]
};
