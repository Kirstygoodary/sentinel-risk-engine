import { scoreMl } from './ml';

describe('scoreMl', () => {
  it('maps NONE and LOW to CLEAR', () => {
    expect(scoreMl('NONE')?.tier).toBe('CLEAR');
    expect(scoreMl('LOW')?.tier).toBe('CLEAR');
  });

  it('maps MEDIUM to T2 and HIGH to T3', () => {
    expect(scoreMl('MEDIUM')?.tier).toBe('T2');
    expect(scoreMl('HIGH')?.tier).toBe('T3');
  });

  it('returns undefined when there is no ML verdict', () => {
    expect(scoreMl(null)).toBeUndefined();
    expect(scoreMl(undefined)).toBeUndefined();
  });

  it('tags the source as ML and never exposes a numeric score', () => {
    const r = scoreMl('HIGH');
    expect(r?.source).toBe('ML');
    expect(r?.detail).toBe('ml=HIGH'); // categorical, not a raw number
  });
});
