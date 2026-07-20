/**
 * Fixture: broker aggregate must NOT produce rollup/total rows.
 * Rows with null/undefined/empty dimension values are dropped.
 */
import { describe, it, expect } from 'vitest';

// Inline the broker grouping logic to test without a network call.
function executeAggregateFixture(
  rows: Record<string, unknown>[],
  dimensions: { field: string; alias?: string }[],
  metrics: { operation: string; field?: string; alias: string }[],
) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = dimensions.map((d) => String(row[d.alias || d.field] ?? "")).join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const results: Record<string, unknown>[] = [];
  for (const [, groupRows] of groups) {
    const result: Record<string, unknown> = {};
    let hasNullDimension = false;
    for (const d of dimensions) {
      const alias = d.alias || d.field;
      const val = groupRows[0][alias];
      if (val === null || val === undefined || val === "") { hasNullDimension = true; break; }
      result[alias] = val;
    }
    if (hasNullDimension) continue;
    for (const m of metrics) {
      const values = groupRows.map((r) => r[m.field ?? ""] as number).filter((v) => typeof v === "number");
      result[m.alias] = m.operation === "count" ? groupRows.length : values.reduce((a, b) => a + b, 0);
    }
    results.push(result);
  }
  return results;
}

describe('broker aggregate: no rollup rows', () => {
  const sourceRows = [
    { age: "25", record_count: 10 },
    { age: "30", record_count: 20 },
    { age: "25", record_count: 5 },
    { age: null, record_count: 100 },   // rollup/total row
    { age: undefined, record_count: 50 }, // another null-dimension row
    { age: "", record_count: 7 },         // empty string dimension
  ];

  it('drops rows where dimension value is null, undefined, or empty', () => {
    const results = executeAggregateFixture(
      sourceRows,
      [{ field: "age", alias: "age" }],
      [{ operation: "sum", field: "record_count", alias: "record_count" }],
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.age).sort()).toEqual(["25", "30"]);
    expect(results.find((r) => r.age === "25")!.record_count).toBe(15);
    expect(results.find((r) => r.age === "30")!.record_count).toBe(20);
  });

  it('first row keys do not include "undefined"', () => {
    const results = executeAggregateFixture(
      sourceRows,
      [{ field: "age", alias: "age" }],
      [{ operation: "sum", field: "record_count", alias: "record_count" }],
    );
    for (const row of results) {
      expect(Object.keys(row)).not.toContain("undefined");
      expect(Object.values(row)).not.toContain(undefined);
      expect(Object.values(row)).not.toContain(null);
      expect(Object.values(row)).not.toContain("");
    }
  });
});
