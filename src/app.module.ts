import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RiskEngineModule } from './risk-engine/risk-engine.module';
import { EscrowModule } from './escrow/escrow.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // drives the matured-hold release cron
    RiskEngineModule,
    EscrowModule,
    LedgerModule,
  ],
})
export class AppModule {}
