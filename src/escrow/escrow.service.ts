import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class EscrowService {
  /**
   * Create a hold for a scored transaction.
   * [fill: tier → TIER_HOLD_DAYS → releaseAt; write the EscrowHold; record the
   *  HOLD ledger entry (debit available / credit escrow). Skip in shadow mode.]
   */
  async holdForDecision(/* [fill: transactionId, decision] */): Promise<void> {
    throw new Error('holdForDecision: [fill] not implemented');
  }

  /**
   * Release holds whose releaseAt has passed — UNLESS the account is paused.
   * [fill: query matured HELD holds, skip paused accounts, move funds
   *  escrow→available via ledger, mark RELEASED. Idempotent + transactional.]
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async releaseMaturedHolds(): Promise<void> {
    // [fill]
  }

  /**
   * Reverse a hold on a confirmed bad outcome (chargeback) — the "reversible"
   * half of graduated enforcement.
   * [fill: cancel the hold, return funds, record CANCEL ledger entry.]
   */
  async reverseHold(/* [fill: holdId, reason] */): Promise<void> {
    throw new Error('reverseHold: [fill] not implemented');
  }
}
