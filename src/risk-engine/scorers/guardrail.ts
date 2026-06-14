import { SignalResult } from '../risk-engine.types';

/**
 * Guardrail signal — the hard tripwire / backstop.
 *
 * The other three signals are probabilistic ("this LOOKS risky"). The guardrail
 * is deterministic and blunt by design: "this account has ALREADY cost us real
 * money recently — stop now." It exists to catch what slips past the others, so
 * when it fires it overrides everything and forces an account pause (see
 * decideTier override ordering).
 *
 * Trips when BOTH hold:
 *  1. realized losses in the window exceed LOSS_THRESHOLD_MINOR — i.e. money we
 *     actually paid out and then lost to chargebacks, not just suspicion; AND
 *  2. there's a late-chargeback pattern (>= MIN_LATE_CB) — losses that landed
 *     after funds were released, which is the failure mode escrow can't undo.
 *
 * Requiring BOTH avoids tripping on a single large legitimate dispute: it fires
 * on a *pattern* of realized, post-release losses.
 *
 * ── Constants (chosen here from first principles, tunable) ──
 */

// Realized losses above this (in minor units) are material. ~£100 equivalent —
// round, defensible; below this a pause would be disproportionate.
const LOSS_THRESHOLD_MINOR = 10_000;

// A pattern, not a one-off: at least this many late (post-release) chargebacks.
const MIN_LATE_CB = 2;

export interface GuardrailInput {
  /** Money already paid out and then lost to chargebacks, in MINOR units. */
  realizedLossMinor: number;
  /** Chargebacks that landed AFTER funds were released, in the window. */
  lateChargebacks: number;
}

export function scoreGuardrail(input: GuardrailInput): SignalResult | undefined {
  const tripped =
    input.realizedLossMinor > LOSS_THRESHOLD_MINOR && input.lateChargebacks >= MIN_LATE_CB;

  if (!tripped) return undefined; // no signal — the backstop only speaks when it fires

  return {
    source: 'GUARDRAIL',
    tier: 'T3',
    autoPause: true,
    detail: `late_cb=${input.lateChargebacks}`, // count only; never the £ amount
  };
}
