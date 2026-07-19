import { describe, it, expect } from 'vitest';
import { resolveBinding, caseMatches } from '../ReportContext';
import type { AirspecBinding, AirspecGraphic } from '../../../../types/airspec';

describe('resolveBinding type coercion', () => {
  it('caseMatches: numeric equals coerces string param value', () => {
    expect(caseMatches(3, '3')).toBe(true);
    expect(caseMatches(3, 3)).toBe(true);
    expect(caseMatches(3, '3.0')).toBe(true);
    expect(caseMatches(3, '5')).toBe(false);
    expect(caseMatches(3, NaN)).toBe(false);
  });

  it('caseMatches: boolean equals coerces truthy/falsy', () => {
    expect(caseMatches(true, true)).toBe(true);
    expect(caseMatches(false, false)).toBe(true);
    expect(caseMatches(false, 0)).toBe(true);
    expect(caseMatches(false, '')).toBe(true);
    expect(caseMatches(true, 1)).toBe(true);
    // Note: Boolean('false') is true because any non-empty string is truthy.
    // Boolean bindings should use option-value lookup, not raw DOM strings.
    expect(caseMatches(true, 'yes')).toBe(true);
    expect(caseMatches(false, 'no')).toBe(false);
  });

  it('caseMatches: string equals compares as strings', () => {
    expect(caseMatches('all', 'all')).toBe(true);
    expect(caseMatches('all', 'ALL')).toBe(false);
  });

  it('resolveBinding: string param value matches numeric case (the frozen-dropdown bug)', () => {
    const binding: AirspecBinding<AirspecGraphic> = {
      parameter: 'bins',
      cases: [
        { equals: 3, value: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic },
        { equals: 5, value: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic },
        { equals: 10, value: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic },
      ],
      default: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic,
    };

    // Simulate HTML <select> returning string "5" for a numeric-option parameter.
    const result = resolveBinding(binding, { bins: '5' });
    expect(result.matched).toBe(true);
    expect(result.value).toBe(binding.cases[1].value);
  });

  it('resolveBinding: unmatched value returns default with matched=false (not silent)', () => {
    const binding: AirspecBinding<AirspecGraphic> = {
      parameter: 'bins',
      cases: [
        { equals: 3, value: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic },
        { equals: 10, value: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic },
      ],
      default: { mark: { type: 'bar' }, encoding: {} } as unknown as AirspecGraphic,
    };

    const result = resolveBinding(binding, { bins: '99' });
    expect(result.matched).toBe(false);
    expect(result.value).toBe(binding.default);
  });

  it('resolveBinding: exact numeric type still works', () => {
    const binding: AirspecBinding<number> = {
      parameter: 'topN',
      cases: [
        { equals: 5, value: 5 },
        { equals: 10, value: 10 },
        { equals: 20, value: 20 },
      ],
      default: 10,
    };

    expect(resolveBinding(binding, { topN: 10 })).toEqual({ matched: true, value: 10 });
    expect(resolveBinding(binding, { topN: '20' })).toEqual({ matched: true, value: 20 });
    expect(resolveBinding(binding, { topN: 50 })).toEqual({ matched: false, value: 10 });
  });
});
