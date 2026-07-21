import { useCallback, useRef, useState, useMemo, Component, type ReactNode } from 'react';
import { AirmarkChartAuto } from '@airspec/airmark-react';
import type { AirspecGraphic, AirspecSelection } from '../../../../../types/airspec';

interface RenderGraphicProps {
  graphic: AirspecGraphic;
  data: Record<string, unknown>[];
  selectionStates: Record<string, unknown>;
  onSelectionChange: (selectionId: string, type: 'point' | 'interval', fields: string[], value: unknown, row: Record<string, unknown>) => void;
  transitionMs?: number;
}

interface TooltipContent {
  visible: boolean;
  lines: { label: string; value: string }[];
}

function parseTooltipText(text: string): { label: string; value: string }[] {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf(': ');
      if (idx === -1) return { label: line, value: '' };
      return { label: line.slice(0, idx), value: line.slice(idx + 2) };
    })
    .filter((r) => r.label.trim() !== '');
}

const TOOLTIP_W = 220;
const TOOLTIP_OFFSET = 14;

export function RenderGraphic({ graphic, data, selectionStates, onSelectionChange, transitionMs }: RenderGraphicProps) {
  const selectionState = useMemo(
    () => buildSelectionState(graphic, selectionStates),
    [graphic, selectionStates],
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const activeTitleRef = useRef<{ el: Element; original: string } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipContent>({ visible: false, lines: [] });

  const handleSelect = useCallback((payload: { selection: string; datum: Record<string, unknown>; fields?: string[] }) => {
    const fields = payload.fields ?? [];
    const value = fields.length === 1
      ? payload.datum[fields[0]]
      : Object.fromEntries(fields.map((f) => [f, payload.datum[f]]));
    onSelectionChange(payload.selection, 'point', fields, value, payload.datum);
  }, [onSelectionChange]);

  const positionTooltip = useCallback((clientX: number, clientY: number) => {
    const el = tooltipRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const containerW = wrapper.offsetWidth;
    const containerH = wrapper.offsetHeight;
    const panelH = el.offsetHeight || 60;

    let left = x + TOOLTIP_OFFSET;
    if (left + TOOLTIP_W > containerW - 8) left = x - TOOLTIP_W - TOOLTIP_OFFSET;
    if (left < 8) left = 8;

    let top = y - panelH / 2;
    if (top + panelH > containerH - 8) top = containerH - panelH - 8;
    if (top < 8) top = 8;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const titleEl = target.querySelector?.('title') ?? null;

    if (titleEl && titleEl.textContent) {
      if (activeTitleRef.current?.el !== target) {
        if (activeTitleRef.current) {
          const prevTitle = activeTitleRef.current.el.querySelector('title');
          if (prevTitle) prevTitle.textContent = activeTitleRef.current.original;
        }
        const original = titleEl.textContent;
        activeTitleRef.current = { el: target, original };
        titleEl.textContent = '';
        const lines = parseTooltipText(original);
        if (lines.length > 0) {
          setTooltip({ visible: true, lines });
        }
      }
      positionTooltip(e.clientX, e.clientY);
    } else {
      if (activeTitleRef.current) {
        const prevTitle = activeTitleRef.current.el.querySelector('title');
        if (prevTitle) prevTitle.textContent = activeTitleRef.current.original;
        activeTitleRef.current = null;
      }
      setTooltip((prev) => (prev.visible ? { visible: false, lines: prev.lines } : prev));
    }
  }, [positionTooltip]);

  const handleMouseLeave = useCallback(() => {
    if (activeTitleRef.current) {
      const prevTitle = activeTitleRef.current.el.querySelector('title');
      if (prevTitle) prevTitle.textContent = activeTitleRef.current.original;
      activeTitleRef.current = null;
    }
    setTooltip((prev) => (prev.visible ? { visible: false, lines: prev.lines } : prev));
  }, []);

  return (
    <AirmarkErrorBoundary>
      <div
        ref={wrapperRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'relative' }}
      >
        <AirmarkChartAuto
          graphic={graphic as Parameters<typeof AirmarkChartAuto>[0]['graphic']}
          rows={data}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          selectionState={selectionState as any}
          onSelect={handleSelect}
          minHeight={200}
          transitionMs={transitionMs}
        />
        {tooltip.visible && tooltip.lines.length > 0 && (
          <div
            ref={tooltipRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: TOOLTIP_W,
              pointerEvents: 'none',
              zIndex: 50,
            }}
            className="bg-slate-800 text-white rounded-lg shadow-xl px-3 py-2 text-xs"
          >
            {tooltip.lines.map((row, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3" style={{ minHeight: 22 }}>
                <span className="text-slate-400 shrink-0">{row.label}</span>
                <span className="font-medium text-right truncate">{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AirmarkErrorBoundary>
  );
}

function buildSelectionState(
  graphic: AirspecGraphic,
  selectionStates: Record<string, unknown>,
): Record<string, Array<Record<string, unknown>>> | undefined {
  const selections: AirspecSelection[] = [];
  if ('selections' in graphic && Array.isArray(graphic.selections)) {
    selections.push(...graphic.selections);
  }
  if ('layers' in graphic && Array.isArray(graphic.layers)) {
    for (const layer of graphic.layers) {
      if (layer.selections) selections.push(...layer.selections);
    }
  }
  if (selections.length === 0) return undefined;

  const state: Record<string, Array<Record<string, unknown>>> = {};
  let hasAny = false;
  for (const sel of selections) {
    const val = selectionStates[sel.id];
    if (val === undefined || val === null) continue;
    hasAny = true;
    const fields = sel.fields ?? [];
    if (Array.isArray(val)) {
      state[sel.id] = val.map((v) => {
        if (typeof v === 'object' && v !== null) return v as Record<string, unknown>;
        if (fields.length === 1) return { [fields[0]]: v };
        return { value: v };
      });
    } else {
      if (typeof val === 'object' && val !== null) {
        state[sel.id] = [val as Record<string, unknown>];
      } else if (fields.length === 1) {
        state[sel.id] = [{ [fields[0]]: val }];
      } else {
        state[sel.id] = [{ value: val }];
      }
    }
  }
  return hasAny ? state : undefined;
}

interface ErrorBoundaryState { error: string | null }

class AirmarkErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex flex-col gap-1">
          <span className="font-semibold">Rendering Error</span>
          <span className="text-xs text-red-600 font-mono break-all">{this.state.error}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
