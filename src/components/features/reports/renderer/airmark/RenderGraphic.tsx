import { useCallback, Component, type ReactNode } from 'react';
import { AirmarkChartAuto } from '@airspec/airmark-react';
import type { AirspecGraphic, AirspecSelection } from '../../../../../types/airspec';

interface RenderGraphicProps {
  graphic: AirspecGraphic;
  data: Record<string, unknown>[];
  selectionStates: Record<string, unknown>;
  onSelectionChange: (selectionId: string, type: 'point' | 'interval', fields: string[], value: unknown, row: Record<string, unknown>) => void;
}

export function RenderGraphic({ graphic, data, selectionStates, onSelectionChange }: RenderGraphicProps) {
  const selectionState = buildSelectionState(graphic, selectionStates);

  const handleSelect = useCallback((payload: { selection: string; datum: Record<string, unknown>; fields?: string[] }) => {
    const fields = payload.fields ?? [];
    const value = fields.length === 1
      ? payload.datum[fields[0]]
      : Object.fromEntries(fields.map((f) => [f, payload.datum[f]]));
    onSelectionChange(payload.selection, 'point', fields, value, payload.datum);
  }, [onSelectionChange]);

  return (
    <AirmarkErrorBoundary>
      <AirmarkChartAuto
        graphic={graphic as Parameters<typeof AirmarkChartAuto>[0]['graphic']}
        rows={data}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectionState={selectionState as any}
        onSelect={handleSelect}
        minHeight={200}
      />
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
