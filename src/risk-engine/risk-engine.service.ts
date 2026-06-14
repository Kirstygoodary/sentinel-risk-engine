import { Injectable } from '@nestjs/common';
import { decideTier } from './decide-tier';
import { RiskDecision } from './risk-engine.types';

@Injectable()
export class RiskEngineService {
  /**
   * Score a transaction: gather the four signals, combine, return the verdict.
   *
   * [fill: for a given transactionId/accountId —
   *   1. load the account's history (escrow holds / past transactions) for the
   *      MAD + Bayesian windows,
   *   2. run each scorer → SignalResult,
   *   3. decideTier({ ml, outlier, bayesian, guardrail }),
   *   4. persist the RiskDecision (incl. shadow flag),
   *   5. return it.
   *  In SHADOW mode (env), persist the verdict but DON'T let escrow act on it.]
   */
  async scoreTransaction(transactionId: string): Promise<RiskDecision> {
    // [fill] — wire scorers + decideTier here.
    void decideTier;
    throw new Error('scoreTransaction: [fill] not implemented');
  }
}
