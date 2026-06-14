import { Module } from '@nestjs/common';
import { RiskEngineService } from './risk-engine.service';

/**
 * The risk engine: collects signals for a transaction, runs the four scorers,
 * combines them via decideTier(), and hands the verdict to escrow.
 *
 * [fill: add the scorer files as you build them —
 *   scorers/outlier.ts   (MAD vs the account's own history)
 *   scorers/bayesian.ts  (per-account posterior from clean vs charged-back history)
 *   scorers/guardrail.ts (late-loss tripwire)
 *   ml is an inbound field, not computed here.
 *  Keep each scorer a pure function over data you pass in, so they're unit-testable.]
 */
@Module({
  providers: [RiskEngineService],
  exports: [RiskEngineService],
})
export class RiskEngineModule {}
