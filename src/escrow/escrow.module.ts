import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { EscrowService } from './escrow.service';

/**
 * Adaptive escrow: turns a risk tier into a graduated, reversible hold, releases
 * matured holds on a schedule, and applies/lifts account pauses.
 */
@Module({
  imports: [LedgerModule],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
