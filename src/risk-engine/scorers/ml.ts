import { RiskTier, SignalResult } from '../risk-engine.types';

/**
 * ML signal — maps a third-party risk verdict on the transaction to a tier.
 *
 * This signal is INBOUND: we don't compute the ML score ourselves (that's a
 * specialist fraud-ML provider's job). We consume their categorical verdict and
 * translate it into our tier vocabulary. Deliberately the simplest scorer — a
 * pure lookup — and intentionally NOT something we'd put an LLM/our own model on
 * here; it's a trusted external signal folded into the same decision surface.
 *
 * Mapping rationale: low/no risk clears on the standard window; medium earns an
 * extended hold; high gets the longest hold (closest to the chargeback window).
 */
export type MlRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

const ML_TIER: Record<MlRiskLevel, RiskTier> = {
  NONE: 'CLEAR',
  LOW: 'CLEAR',
  MEDIUM: 'T2',
  HIGH: 'T3',
};

/** Returns a SignalResult, or undefined when there is no ML verdict to use. */
export function scoreMl(level: MlRiskLevel | null | undefined): SignalResult | undefined {
  if (level == null) return undefined;
  return { source: 'ML', tier: ML_TIER[level], detail: `ml=${level}` };
}
