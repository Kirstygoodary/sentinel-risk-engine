import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { decideTier } from './decide-tier';
import { RiskDecision } from './risk-engine.types';
import { scoreMl, MlRiskLevel } from './scorers/ml';
import { scoreOutlier } from './scorers/outlier';
import { scoreBayesian } from './scorers/bayesian';
import { scoreGuardrail } from './scorers/guardrail';

/**
 * The orchestrator: for a transaction, gather the signals each scorer needs,
 * run all four, combine via decideTier(), persist the verdict, and hand it to
 * escrow. This is the seam between pure scoring logic and stateful side effects.
 */
@Injectable()
export class RiskEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly config: ConfigService,
  ) {}

  private get shadow(): boolean {
    return this.config.get('RISK_SHADOW_MODE', 'true') !== 'false';
  }

  async scoreTransaction(transactionId: string): Promise<RiskDecision> {
    const tx = await this.prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });

    // ── Gather per-account history the stateful scorers need ──────────────────
    const priorTxns = await this.prisma.transaction.findMany({
      where: { accountId: tx.accountId, id: { not: tx.id } },
      select: { amountMinor: true, outcome: true, lateChargeback: true },
    });
    const history = priorTxns.map((t) => Number(t.amountMinor));
    const chargebacks = priorTxns.filter(
      (t) => t.outcome === 'CHARGEBACK' && !t.lateChargeback,
    ).length;
    const lateChargebacks = priorTxns.filter((t) => t.lateChargeback).length;
    const realizedLossMinor = priorTxns
      .filter((t) => t.lateChargeback)
      .reduce((acc, t) => acc + Number(t.amountMinor), 0);
    const clearedVolumeMajor =
      priorTxns
        .filter((t) => t.outcome === 'CLEAN')
        .reduce((acc, t) => acc + Number(t.amountMinor), 0) / 100;

    // ── Run the four signals ──────────────────────────────────────────────────
    const decision = decideTier({
      ml: scoreMl(tx.mlRiskLevel as MlRiskLevel | null),
      outlier: scoreOutlier(Number(tx.amountMinor), history),
      bayesian: scoreBayesian({ chargebacks, lateChargebacks, clearedVolumeMajor }),
      guardrail: scoreGuardrail({ realizedLossMinor, lateChargebacks }),
    });

    // ── Persist the verdict (auditable, explainable) ─────────────────────────
    await this.prisma.riskDecision.upsert({
      where: { transactionId },
      create: { transactionId, ...toRow(decision), shadow: this.shadow },
      update: { ...toRow(decision), shadow: this.shadow },
    });

    // ── Act (escrow no-ops in shadow mode; applies pauses when enforcing) ─────
    await this.escrow.holdForDecision(transactionId, decision);
    if (!this.shadow && decision.autoPause) {
      await this.applyPause(tx.accountId, decision);
    }

    return decision;
  }

  private async applyPause(accountId: string, decision: RiskDecision): Promise<void> {
    const existing = await this.prisma.accountPause.findFirst({
      where: { accountId, active: true },
    });
    if (existing) return; // already paused
    await this.prisma.accountPause.create({
      data: {
        accountId,
        source: decision.tierSource === 'GUARDRAIL' ? 'AUTO_GUARDRAIL' : 'AUTO_BAYESIAN',
        reason: decision.humanReason,
        active: true,
      },
    });
  }
}

function toRow(d: RiskDecision) {
  return {
    tier: d.tier,
    tierSource: d.tierSource,
    autoPause: d.autoPause,
    reasonCode: d.reasonCode,
    humanReason: d.humanReason,
  };
}
