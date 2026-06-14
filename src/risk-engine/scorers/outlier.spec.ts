import { scoreOutlier } from './outlier';

describe('scoreOutlier (MAD)', () => {
  // A steady spender: ~100 each time.
  const steady = [100, 100, 95, 105, 100, 98, 102];

  it('returns undefined below the minimum history (cold-start guard)', () => {
    expect(scoreOutlier(100, [100, 100])).toBeUndefined();
    expect(scoreOutlier(100, [100, 100, 100, 100])).toBeUndefined(); // 4 < 5
  });

  it('clears a transaction in line with the account’s normal', () => {
    expect(scoreOutlier(101, steady)?.tier).toBe('CLEAR');
  });

  it('flags a wildly larger-than-normal transaction as high tier', () => {
    // ~100 normal, suddenly 5000 → many robust deviations out → T3
    expect(scoreOutlier(5000, steady)?.tier).toBe('T3');
  });

  it('is robust to a single historical outlier (MAD, not mean)', () => {
    // One huge past order shouldn't move the baseline; a normal new order clears.
    const withSpike = [100, 100, 100, 100, 100, 9999];
    expect(scoreOutlier(105, withSpike)?.tier).toBe('CLEAR');
  });

  it('does not divide by zero when history is perfectly constant', () => {
    const constant = [100, 100, 100, 100, 100, 100];
    expect(() => scoreOutlier(100, constant)).not.toThrow();
    expect(scoreOutlier(100, constant)?.tier).toBe('CLEAR');
  });

  it('never exposes a raw amount in detail (rounded deviation only)', () => {
    const r = scoreOutlier(5000, steady);
    expect(r?.detail).not.toContain('5000');
  });
});
