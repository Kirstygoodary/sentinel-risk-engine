/**
 * Synthetic data seed — so the repo runs end-to-end with one command and a
 * reviewer can see verdicts without any real/proprietary data.
 *
 * Creates accounts that each exercise a different path through the engine, then
 * scores one fresh transaction per account and prints the verdict. Deterministic
 * (fixed values, no RNG) so runs repeat identically.
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { RiskEngineService } from '../src/risk-engine/risk-engine.service';

const prisma = new PrismaClient();

interface Scenario {
  name: string;
  history: { amountMinor: number; outcome: 'CLEAN' | 'CHARGEBACK'; late?: boolean }[];
  fresh: { amountMinor: number; ml?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' };
  expect: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Steady clean account',
    history: Array.from({ length: 8 }, () => ({ amountMinor: 10_000, outcome: 'CLEAN' as const })),
    fresh: { amountMinor: 10_500 },
    expect: 'CLEAR — in line with history, clean record',
  },
  {
    name: 'Sudden high-value outlier',
    history: Array.from({ length: 8 }, () => ({ amountMinor: 10_000, outcome: 'CLEAN' as const })),
    fresh: { amountMinor: 250_000 },
    expect: 'Elevated — MAD outlier (25x normal)',
  },
  {
    name: 'Repeat chargeback pattern',
    history: [
      { amountMinor: 10_000, outcome: 'CHARGEBACK' as const },
      { amountMinor: 12_000, outcome: 'CHARGEBACK' as const },
      { amountMinor: 9_000, outcome: 'CHARGEBACK' as const },
      { amountMinor: 11_000, outcome: 'CLEAN' as const },
    ],
    fresh: { amountMinor: 10_000 },
    expect: 'Elevated — Bayesian account risk',
  },
  {
    name: 'High ML risk on the transaction',
    history: Array.from({ length: 6 }, () => ({ amountMinor: 10_000, outcome: 'CLEAN' as const })),
    fresh: { amountMinor: 10_000, ml: 'HIGH' },
    expect: 'T3 — third-party ML flagged HIGH',
  },
  {
    name: 'Late-loss guardrail tripped',
    history: [
      { amountMinor: 60_000, outcome: 'CHARGEBACK' as const, late: true },
      { amountMinor: 70_000, outcome: 'CHARGEBACK' as const, late: true },
      { amountMinor: 10_000, outcome: 'CLEAN' as const },
    ],
    fresh: { amountMinor: 10_000 },
    expect: 'AUTO-PAUSE — guardrail (realized post-release losses)',
  },
];

async function main() {
  // Clean slate.
  await prisma.riskDecision.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.escrowHold.deleteMany();
  await prisma.accountPause.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const engine = app.get(RiskEngineService);

  console.log('\n  Adaptive Risk Engine — scenario walkthrough\n');

  for (const s of SCENARIOS) {
    const account = await prisma.account.create({
      data: { externalRef: `${s.name}-${Date.now()}` },
    });
    for (const h of s.history) {
      await prisma.transaction.create({
        data: {
          accountId: account.id,
          amountMinor: BigInt(h.amountMinor),
          currency: 'GBP',
          outcome: h.outcome,
          lateChargeback: h.late ?? false,
          chargebackAt: h.outcome === 'CHARGEBACK' ? new Date() : null,
        },
      });
    }
    const fresh = await prisma.transaction.create({
      data: {
        accountId: account.id,
        amountMinor: BigInt(s.fresh.amountMinor),
        currency: 'GBP',
        mlRiskLevel: s.fresh.ml ?? null,
      },
    });

    const decision = await engine.scoreTransaction(fresh.id);
    console.log(`  ▸ ${s.name}`);
    console.log(`      verdict : ${decision.tier}  (source: ${decision.tierSource}${decision.autoPause ? ', AUTO-PAUSE' : ''})`);
    console.log(`      reason  : ${decision.humanReason}`);
    console.log(`      expected: ${s.expect}\n`);
  }

  await app.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
