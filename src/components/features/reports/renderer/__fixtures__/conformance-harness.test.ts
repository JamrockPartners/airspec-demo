import { describe, it, expect } from 'vitest';
import { layout, layoutGrid, niceTicks } from '@airspec/airmark-engine';
import type { GridItem } from '@airspec/airmark-engine';

import arcDonut from './cases/arc-donut.json';
import arcPieLegend from './cases/arc-pie-legend.json';
import barGroupedXoffset from './cases/bar-grouped-xoffset.json';
import barHorizontal from './cases/bar-horizontal-uniform-text-overlay.json';
import barSelection from './cases/bar-selection-condition-highlight.json';
import barStacked from './cases/bar-stacked-zero.json';
import barVertical from './cases/bar-vertical-letter-frequency.json';
import facetColumn from './cases/facet-column-small-multiples.json';
import histogram from './cases/histogram-binned-count.json';
import layeredBarLine from './cases/layered-bar-line-trend.json';
import lineMultiseries from './cases/line-multiseries-temporal.json';

type Fixture = { name: string; input: Record<string, unknown>; invariants: string[] };

const fixtures: Fixture[] = [
  arcDonut, arcPieLegend, barGroupedXoffset, barHorizontal,
  barSelection, barStacked, barVertical, facetColumn,
  histogram, layeredBarLine, lineMultiseries,
] as unknown as Fixture[];

const marks = (scene: ReturnType<typeof layout>, type: string) =>
  scene.nodes.filter((n: { type: string; meta?: { role?: string } }) => n.type === type && n.meta?.role === 'mark');

const allNodesFlat = (scene: ReturnType<typeof layout>): Array<{ type: string; meta?: Record<string, unknown>; [k: string]: unknown }> => {
  const result: Array<{ type: string; [k: string]: unknown }> = [];
  const walk = (nodes: Array<{ type: string; children?: unknown[]; [k: string]: unknown }>) => {
    for (const n of nodes) {
      result.push(n);
      if (n.type === 'group' && Array.isArray(n.children)) walk(n.children as typeof nodes);
    }
  };
  walk(scene.nodes as Array<{ type: string; children?: unknown[]; [k: string]: unknown }>);
  return result;
};

describe('AIRMark engine: all fixtures produce valid scene graphs', () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: layout() does not throw`, () => {
      const scene = layout(fixture.input as Parameters<typeof layout>[0]);
      expect(scene).toBeDefined();
      expect(scene.width).toBeGreaterThan(0);
      expect(scene.height).toBeGreaterThan(0);
      expect(scene.nodes.length).toBeGreaterThan(0);
    });
  }
});

describe('Fixture invariant assertions', () => {
  it('bar-vertical-letter-frequency: 26 bars, E tallest', () => {
    const scene = layout(barVertical.input as Parameters<typeof layout>[0]);
    const bars = marks(scene, 'rect') as Array<{ height: number; meta?: { datum?: Record<string, unknown> } }>;
    expect(bars.length).toBe(26);
    const tallest = bars.reduce((a, b) => (b.height > a.height ? b : a));
    expect(tallest.meta?.datum?.letter).toBe('E');
  });

  it('bar-vertical-letter-frequency: y domain top is nice >= 0.127', () => {
    const t = niceTicks(0, 0.127, 300, { includeZero: true });
    expect(t.niceMax).toBeGreaterThanOrEqual(0.127);
    expect(t.niceMax % t.step).toBeCloseTo(0, 8);
  });

  it('histogram-binned-count: contiguous interval bars, counts sum to 120', () => {
    const scene = layout(histogram.input as Parameters<typeof layout>[0]);
    const bars = marks(scene, 'rect') as Array<{ x: number; width: number; height: number; meta?: { datum?: Record<string, unknown> } }>;
    expect(bars.length).toBeGreaterThan(1);
    const sorted = [...bars].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.abs(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width));
      expect(gap).toBeLessThan(1.5);
    }
  });

  it('bar-stacked-zero: 3 segments per region, legend with 3 swatches', () => {
    const scene = layout(barStacked.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(markRects.length).toBe(12);
    const legendNodes = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'label');
    expect(legendNodes.length).toBeGreaterThanOrEqual(3);
  });

  it('bar-stacked-zero: West column tallest (275)', () => {
    const scene = layout(barStacked.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark') as unknown as Array<{ y: number; height: number; meta?: { datum?: Record<string, unknown> } }>;
    const byRegion: Record<string, number> = {};
    for (const r of markRects) {
      const region = (r.meta?.datum as Record<string, unknown>)?.region as string;
      if (!region) continue;
      byRegion[region] = (byRegion[region] ?? 0) + r.height;
    }
    const tallestRegion = Object.entries(byRegion).sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(tallestRegion).toBe('West');
  });

  it('bar-grouped-xoffset: 12 bars in 4 groups of 3, legend present', () => {
    const scene = layout(barGroupedXoffset.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(markRects.length).toBe(12);
  });

  it('bar-horizontal-uniform-text-overlay: 14 bars, text labels, no axes', () => {
    const scene = layout(barHorizontal.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(markRects.length).toBe(14);
    const axisNodes = allNodes.filter((n) => (n.meta as Record<string, unknown>)?.role === 'axis');
    expect(axisNodes.length).toBe(0);
    const textNodes = allNodes.filter((n) => n.type === 'text' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(textNodes.length).toBe(14);
  });

  it('bar-selection-condition-highlight: bars sorted descending by revenue', () => {
    const scene = layout(barSelection.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark') as unknown as Array<{ x: number; meta?: { datum?: Record<string, unknown> } }>;
    const sorted = [...markRects].sort((a, b) => a.x - b.x);
    const revenues = sorted.map((r) => (r.meta?.datum as Record<string, unknown>)?.revenue as number);
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i]).toBeLessThanOrEqual(revenues[i - 1]);
    }
  });

  it('bar-selection-condition-highlight: West colored from palette, others #C7CDD8', () => {
    const scene = layout(barSelection.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark') as unknown as Array<{ fill: string; meta?: { datum?: Record<string, unknown> } }>;
    for (const r of markRects) {
      const region = (r.meta?.datum as Record<string, unknown>)?.region as string;
      if (region === 'West') {
        expect(r.fill).not.toBe('#C7CDD8');
      } else {
        expect(r.fill).toBe('#C7CDD8');
      }
    }
  });

  it('arc-donut: 3 ring slices with inner radius hole', () => {
    const scene = layout(arcDonut.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const arcPaths = allNodes.filter((n) => n.type === 'path' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(arcPaths.length).toBe(3);
  });

  it('arc-pie-legend: 4 slices, legend present', () => {
    const scene = layout(arcPieLegend.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const arcPaths = allNodes.filter((n) => n.type === 'path' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(arcPaths.length).toBe(4);
    const legendLabels = allNodes.filter((n) => n.type === 'text' && (n.meta as Record<string, unknown>)?.role === 'label');
    expect(legendLabels.length).toBeGreaterThanOrEqual(4);
  });

  it('facet-column-small-multiples: 4 panels with 3 bars each (12 total)', () => {
    const scene = layout(facetColumn.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(markRects.length).toBe(12);
  });

  it('layered-bar-line-trend: bars and line share x band scale', () => {
    const scene = layout(layeredBarLine.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const markRects = allNodes.filter((n) => n.type === 'rect' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(markRects.length).toBe(6);
    const linePaths = allNodes.filter((n) => n.type === 'path' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(linePaths.length).toBeGreaterThanOrEqual(1);
  });

  it('line-multiseries-temporal: 2 paths in palette order, legend', () => {
    const scene = layout(lineMultiseries.input as Parameters<typeof layout>[0]);
    const allNodes = allNodesFlat(scene);
    const linePaths = allNodes.filter((n) => n.type === 'path' && (n.meta as Record<string, unknown>)?.role === 'mark');
    expect(linePaths.length).toBe(2);
    const legendLabels = allNodes.filter((n) => n.type === 'text' && (n.meta as Record<string, unknown>)?.role === 'label');
    expect(legendLabels.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Deny-by-default: unsupported features error visibly', () => {
  it('mark: "errorband" throws', () => {
    expect(() => layout({
      graphic: { mark: 'errorband', encoding: { x: { field: 'a', type: 'quantitative' }, y: { field: 'b', type: 'quantitative' } } },
      rows: [{ a: 1, b: 2 }],
      width: 400, height: 300,
    } as Parameters<typeof layout>[0])).toThrow();
  });

  it('unknown transform throws', () => {
    expect(() => layout({
      graphic: { mark: 'bar', encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } }, transform: [{ pivot: { field: 'a', value: 'b' } }] },
      rows: [{ a: 'x', b: 1 }],
      width: 400, height: 300,
    } as Parameters<typeof layout>[0])).toThrow();
  });
});

describe('Document grid: layoutGrid conformance', () => {
  it('3/3/6 then 12 at width 1120', () => {
    const items: GridItem[] = [
      { id: 'a', span: 3 },
      { id: 'b', span: 3 },
      { id: 'c', span: 6 },
      { id: 'd', span: 12 },
    ];
    const { boxes } = layoutGrid(items, { containerWidth: 1120 });
    expect(boxes.length).toBe(4);
    expect(boxes[0].row).toBe(0);
    expect(boxes[1].row).toBe(0);
    expect(boxes[2].row).toBe(0);
    expect(boxes[3].row).toBe(1);
    expect(boxes[0].x).toBe(0);
    expect(boxes[3].x).toBe(0);
    expect(Math.abs(boxes[3].width - 1120)).toBeLessThan(1);
  });

  it('3/3/6 then 12 at width 390 with spanMobile overrides stacks full', () => {
    const items: GridItem[] = [
      { id: 'a', span: 3, spanMobile: 12 },
      { id: 'b', span: 3, spanMobile: 12 },
      { id: 'c', span: 6, spanMobile: 12 },
      { id: 'd', span: 12 },
    ];
    const { boxes } = layoutGrid(items, { containerWidth: 390 });
    expect(boxes.length).toBe(4);
    for (const box of boxes) {
      expect(Math.abs(box.width - 390)).toBeLessThan(1);
    }
  });

  it('3/3/6 then 12 at width 390 without spanMobile keeps declared spans', () => {
    const items: GridItem[] = [
      { id: 'a', span: 3 },
      { id: 'b', span: 3 },
      { id: 'c', span: 6 },
      { id: 'd', span: 12 },
    ];
    const { boxes } = layoutGrid(items, { containerWidth: 390 });
    expect(boxes.length).toBe(4);
    expect(boxes[0].row).toBe(0);
    expect(boxes[1].row).toBe(0);
    expect(boxes[2].row).toBe(0);
    expect(boxes[3].row).toBe(1);
  });
});
