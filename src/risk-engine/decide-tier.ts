import { RiskDecision, RiskDecisionInput, RiskTier, SignalResult } from './risk-engine.types';

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
  const signals = [input.guardrail, input.bayesian, input.outlier, input.ml].filter(
    (s): s is SignalResult => s != null,
  );

  // 1. Guardrail is a hard tripwire — active, late-arriving losses. If it fired,
  //    it wins outright and forces an account-level pause. Nothing overrides it.
  if (input.guardrail?.autoPause) {
    return verdict('GUARDRAIL', input.guardrail.tier, true);
  }

  // 2. Otherwise, any signal demanding an auto-pause (e.g. Bayesian over the
  //    account-risk threshold) beats a mere tier from another signal.
  const pauser = signals.find((s) => s.autoPause);
  if (pauser) {
    return verdict(pauser.source, pauser.tier, true);
  }

  // 3. Otherwise, the most cautious single signal wins: take the MAX tier and
  //    record which source drove it. (We act on the strongest signal, not a
  //    combined score — simpler to reason about and to explain in a dispute.)
  let top: SignalResult | undefined;
  for (const s of signals) {
    if (!top || TIER_RANK[s.tier] > TIER_RANK[top.tier]) top = s;
  }

  // 4. No signals (or all CLEAR) → clear by default.
  if (!top || top.tier === 'CLEAR') {
    return verdict('DEFAULT', 'CLEAR', false);
  }

  return verdict(top.source, top.tier, false);
}

/** Build the verdict + its creator-safe reason. Raw scores never leak here. */
function verdict(
  tierSource: RiskDecision['tierSource'],
  tier: RiskTier,
  autoPause: boolean,
): RiskDecision {
  const reasonCode = `${tierSource}_${tier}${autoPause ? '_PAUSE' : ''}`;
  return { tier, tierSource, autoPause, reasonCode, humanReason: humanReason(tierSource, autoPause) };
}

/**
 * Map a verdict to a human-readable explanation. Deliberately coarse: keyed by
 * SOURCE (and pause), never by raw score — so internal numbers can't leak to the
 * account holder, while still telling them honestly why funds are held.
 */
function humanReason(source: RiskDecision['tierSource'], autoPause: boolean): string {
  if (autoPause) {
    return 'This account is paused for manual review while we verify recent activity.';
  }
  switch (source) {
    case 'GUARDRAIL':
      return 'Recent losses on this account triggered an extended review of this payment.';
    case 'BAYESIAN':
      return 'This account’s history placed this payment in an extended review window.';
    case 'OUTLIER':
      return 'This payment was unusual for this account, so it was placed in a review window.';
    case 'ML':
      return 'An automated risk check placed this payment in a review window.';
    case 'DEFAULT':
    default:
      return 'This payment is approved for the standard release window.';
  }
}

/**
 * Tier → hold duration in days.
 *
 * Shape: even a CLEAR transaction gets a short buffer (low-risk orders can still
 * be disputed); the top tier approaches the ~120-day card-network chargeback
 * window, so a chargeback on a high-risk transaction almost always lands BEFORE
 * we release the funds — letting us cancel the hold instead of paying out fraud.
 */
export const TIER_HOLD_DAYS: Record<RiskTier, number> = {
  CLEAR: 30,
  WATCH: 45,
  T1: 60,
  T2: 90,
  T3: 120,
};
