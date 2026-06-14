/**
 * Core types for the decision engine. Kept framework-free + I/O-free so the
 * decision logic is a PURE FUNCTION — trivially testable, the property a
 * reviewer looks for in risk code.
 */

export type RiskTier = 'CLEAR' | 'WATCH' | 'T1' | 'T2' | 'T3';

export type SignalSource = 'ML' | 'OUTLIER' | 'BAYESIAN' | 'GUARDRAIL';

/** What each signal contributes to the decision. */
export interface SignalResult {
  source: SignalSource;
  tier: RiskTier;
  /** True if this signal demands an account-level pause (overrides tiers). */
  autoPause?: boolean;
  /** Internal, for audit/debug — NOT surfaced to the end user. */
  detail?: string;
}

/** The combined inputs the decision engine reasons over. */
export interface RiskDecisionInput {
  ml?: SignalResult;
  outlier?: SignalResult;
  bayesian?: SignalResult;
  guardrail?: SignalResult;
}

/** The engine's verdict. */
export interface RiskDecision {
  tier: RiskTier;
  tierSource: SignalSource | 'DEFAULT';
  autoPause: boolean;
  /** Creator-safe explanation. No raw scores. */
  humanReason: string;
  /** Internal reason code for audit. */
  reasonCode: string;
}
