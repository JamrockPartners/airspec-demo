import { describe, it, expect } from 'vitest';
import { niceTicks } from '@airspec/airmark-engine';

describe('niceTicks from @airspec/airmark-engine', () => {
  it('produces nice tick values for 0..0.127 over 300px', () => {
    const t = niceTicks(0, 0.127, 300, { includeZero: true });
    expect(t.step).toBe(0.05);
    expect(t.niceMin).toBe(0);
    expect(Math.abs(t.niceMax - 0.15)).toBeLessThan(1e-9);
    expect(t.ticks).toHaveLength(4);
  });

  it('handles small range correctly', () => {
    const t = niceTicks(0, 10, 400, { includeZero: true });
    expect(t.niceMin).toBe(0);
    expect(t.niceMax).toBeGreaterThanOrEqual(10);
    expect(t.ticks.length).toBeGreaterThan(1);
  });

  it('respects includeZero', () => {
    const t = niceTicks(5, 15, 300, { includeZero: true });
    expect(t.niceMin).toBe(0);
  });

  it('without includeZero, domain can start above 0', () => {
    const t = niceTicks(5, 15, 300, {});
    expect(t.niceMin).toBeLessThanOrEqual(5);
  });
});
