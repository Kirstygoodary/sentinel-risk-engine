import { Module } from '@nestjs/common';
import { EscrowModule } from '../escrow/escrow.module';
import { PrismaService } from '../common/prisma.service';
import { RiskEngineService } from './risk-engine.service';

/**
 * The risk engine: collects signals for a transaction, runs the four scorers
 * (src/risk-engine/scorers/*), combines them via decideTier(), persists the
 * verdict, and hands it to escrow. Each scorer is a pure function over data the
 * orchestrator passes in, so the scoring logic is unit-tested in isolation.
 */
@Module({
  imports: [EscrowModule],
  providers: [PrismaService, RiskEngineService],
  exports: [RiskEngineService],
})
export class RiskEngineModule {}
