/**
 * Synthetic data seed — so the repo runs end-to-end with one command and a
 * reviewer can see verdicts without any real/proprietary data.
 *
 * [fill: generate a believable spread of accounts + transactions that exercise
 *  EVERY path of your engine:
 *   - a clean account → CLEAR tier, fast release
 *   - an account with one high-value outlier → WATCH/T1 (MAD fires)
 *   - an account with chargeback history → elevated Bayesian → T2/T3
 *   - an account tripping the late-loss guardrail → auto-pause
 *   - an account that earns trust back over time → rehab lift
 *  This synthetic generator IS also how you tune your re-derived constants and
 *  demo the calibration ramp. Make it deterministic (seeded RNG) so runs repeat.]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // [fill: create Accounts + Transactions covering the scenarios above.]
  console.log('Seed: [fill] — generate synthetic accounts + transactions.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
