import { RiskTier, SignalResult } from '../risk-engine.types';

/**
 * Outlier signal — is this transaction's value abnormal vs the account's OWN
 * spending history? Uses Median Absolute Deviation (MAD), not mean/stddev,
 * because MAD is robust to outliers — a single large fraudulent order won't
 * distort the baseline the way a mean would. (Fraud *is* the outlier, so the
 * baseline must ignore it.)
 *
 *   median           = median(history)
 *   mad              = median(|x - median| for x in history)
 *   robustDeviations = |amount - median| / max(mad, MAD_FLOOR)
 *
 * Constants below are chosen for this implementation (not lifted from anywhere)
 * and are deliberately tunable:
 *  - MIN_HISTORY: below this, "median/deviation" is meaningless → no signal
 *    (the cold-start guard; ties into shadow/calibration — we don't act until we
 *    know an account's normal).
 *  - MAD_FLOOR_FRACTION: the floor on MAD is a fraction of the account's median
 *    spend, not an absolute amount. This avoids divide-by-zero when an account
 *    spends an identical amount every time, AND keeps the floor proportionate:
 *    a small % wobble on a £100 account shouldn't trip the scorer, but the same
 *    absolute wobble on a £2 account should. (An absolute floor would make a
 *    near-constant high-value account hypersensitive to tiny deviations.)
 *  - THRESHOLDS: how many robust deviations out maps to which tier.
 */
const MIN_HISTORY = 5;
const MAD_FLOOR_FRACTION = 0.1; // floor MAD at 10% of the account's median spend
const THRESHOLDS: { min: number; tier: RiskTier }[] = [
  { min: 10, tier: 'T3' }, // wildly out of pattern
  { min: 6, tier: 'T2' },
  { min: 3, tier: 'WATCH' }, // mildly unusual
];

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * @param amountMinor  the new transaction's value (minor units)
 * @param historyMinor the account's prior transaction values (minor units)
 */
export function scoreOutlier(
  amountMinor: number,
  historyMinor: number[],
): SignalResult | undefined {
  // Cold-start guard: not enough history to know what "normal" is → no signal.
  if (historyMinor.length < MIN_HISTORY) return undefined;

  const sorted = [...historyMinor].sort((a, b) => a - b);
  const med = median(sorted);
  const absDevs = sorted.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  // Floor MAD proportionally: at least MAD_FLOOR_FRACTION of the median spend
  // (and never below 1 minor unit, to stay divide-by-zero safe at tiny medians).
  const floor = Math.max(med * MAD_FLOOR_FRACTION, 1);
  const mad = Math.max(median(absDevs), floor);

  const robustDeviations = Math.abs(amountMinor - med) / mad;

  for (const { min, tier } of THRESHOLDS) {
    if (robustDeviations >= min) {
      // detail is rounded + internal-only; never surfaced to the account holder.
      return { source: 'OUTLIER', tier, detail: `mad_dev=${robustDeviations.toFixed(1)}` };
    }
  }
  return { source: 'OUTLIER', tier: 'CLEAR', detail: `mad_dev=${robustDeviations.toFixed(1)}` };
}
