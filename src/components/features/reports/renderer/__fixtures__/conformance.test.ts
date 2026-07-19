import { describe, it, expect } from 'vitest';
import { validateDocument } from '../validateDocument';
import type { AirspecDocument } from '../../../../types/airspec';
import validCount from './valid-count-encoding.json';
import invalidNumberBinding from './invalid-number-binding.json';

describe('AIRspec conformance fixtures', () => {
  it('valid-count-encoding: field-less count channel passes validation', () => {
    const errors = validateDocument(validCount as unknown as AirspecDocument);
    expect(errors).toEqual([]);
  });

  it('invalid-number-binding: binding to a number parameter is rejected', () => {
    const errors = validateDocument(invalidNumberBinding as unknown as AirspecDocument);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.path.includes('graphicBinding') && e.message.includes('select or boolean'))).toBe(true);
  });
});
