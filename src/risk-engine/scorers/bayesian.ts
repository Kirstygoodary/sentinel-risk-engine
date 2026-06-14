import { RiskTier, SignalResult } from '../risk-engine.types';

/**
 * Bayesian signal — scores the ACCOUNT, not the transaction. "Given everything
 * this account has done (clean orders vs chargebacks, and how much proven volume
 * it has cleared), how likely is it to be fraudulent?"
 *
 * Model: a logistic (log-odds) update. We start from a prior log-odds that an
 * account is risky, then move it:
 *   + each chargeback pushes risk UP (recent/late ones weigh more),
 *   - cleared volume builds TRUST and pushes risk DOWN (capped, so a fraudster
 *     can't simply buy trust with a flood of small clean orders).
 * The posterior probability = sigmoid(log-odds). Above AUTO_PAUSE → pause the
 * account; otherwise map the probability to a hold tier.
 *
 * ── Constants (chosen for THIS implementation from first principles, tunable) ──
 * Rationale documented inline so each is defensible:
 */

// Prior: accounts are usually fine. p0 ≈ 0.02 risky → log-odds ≈ ln(0.02/0.98).
const PRIOR_LOG_ODDS = Math.log(0.02 / 0.98); // ≈ -3.89

// Each chargeback is strong evidence. One CB ~ +1.5 log-odds (≈ multiplies the
// odds of risk by ~4.5). Late/realized-loss CBs weigh more (see WEIGHT_LATE_CB).
const WEIGHT_CB = 1.5;
const WEIGHT_LATE_CB = 2.5; // a chargeback that slipped past a hold is worse

// Trust: cleared volume lowers risk, but with diminishing returns and a CAP, so
// a fraudster can't "wash" their score with many tiny clean orders. We use
// log10 of cleared volume (in major units) × a rate, capped.
const TRUST_RATE = 0.6; // log-odds reduction per order of magnitude of clean volume
const TRUST_CAP = 3.0; // never subtract more than this much trust

// Probability → action. Above AUTO_PAUSE the account is paused for review.
const AUTO_PAUSE = 0.9;
const TIER_BANDS: { min: number; tier: RiskTier }[] = [
  { min: 0.7, tier: 'T3' },
  { min: 0.4, tier: 'T2' },
  { min: 0.2, tier: 'WATCH' },
];

export interface BayesianInput {
  /** Number of chargebacks that arrived within the normal window. */
  chargebacks: number;
  /** Chargebacks that landed AFTER funds had been released (worse). */
  lateChargebacks: number;
  /** Total value the account has had cleanly released, in MAJOR units. */
  clearedVolumeMajor: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function scoreBayesian(input: BayesianInput): SignalResult {
  const trust = Math.min(
    input.clearedVolumeMajor > 0 ? Math.log10(input.clearedVolumeMajor + 1) * TRUST_RATE : 0,
    TRUST_CAP,
  );

  const logOdds =
    PRIOR_LOG_ODDS +
    input.chargebacks * WEIGHT_CB +
    input.lateChargebacks * WEIGHT_LATE_CB -
    trust;

  const posterior = sigmoid(logOdds);

  if (posterior >= AUTO_PAUSE) {
    return { source: 'BAYESIAN', tier: 'T3', autoPause: true, detail: `p=${posterior.toFixed(2)}` };
  }
  for (const { min, tier } of TIER_BANDS) {
    if (posterior >= min) {
      return { source: 'BAYESIAN', tier, detail: `p=${posterior.toFixed(2)}` };
    }
  }
  return { source: 'BAYESIAN', tier: 'CLEAR', detail: `p=${posterior.toFixed(2)}` };
}
