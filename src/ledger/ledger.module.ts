import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * Double-entry ledger — the auditable money path. Every movement is a balanced
 * pair of entries; balances are DERIVED by summing entries, never stored. This
 * is what makes every escrow action reversible and every figure provable.
 */
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
