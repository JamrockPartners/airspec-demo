import { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import { useReportContext } from '../ReportContext';
import { useGridContext } from '../GridContext';
import { RenderGraphic } from '../airmark/RenderGraphic';
import type { AirspecChartComponent, AirspecGraphic } from '../../../../../types/airspec';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Encoding = Record<string, any>;

function enforceDomainBounds(graphic: AirspecGraphic, data: Record<string, unknown>[]): Record<string, unknown>[] {
  if (!data.length) return data;

  const encodings: Encoding[] = [];
  if ('encoding' in graphic && graphic.encoding) {
    encodings.push(graphic.encoding as Encoding);
  }
  if ('layers' in graphic && Array.isArray(graphic.layers)) {
    for (const layer of graphic.layers) {
      if (layer.encoding) encodings.push(layer.encoding as Encoding);
    }
  }

  const syntheticRow: Record<string, unknown> = {};
  let needsInjection = false;

  for (const encoding of encodings) {
    for (const channel of Object.values(encoding)) {
      if (!channel || typeof channel !== 'object') continue;
      const ch = channel as { field?: string; scale?: { domain?: unknown[] }; type?: string };
      if (!ch.field || !ch.scale?.domain || !Array.isArray(ch.scale.domain)) continue;
      if (ch.type !== 'quantitative') continue;
      const [lo, hi] = ch.scale.domain as [number, number];
      if (typeof hi !== 'number') continue;
      const maxInData = Math.max(...data.map(r => {
        const v = r[ch.field!];
        return typeof v === 'number' ? v : -Infinity;
      }));
      if (maxInData < hi) {
        syntheticRow[ch.field!] = hi;
        needsInjection = true;
      }
      if (typeof lo === 'number') {
        const minInData = Math.min(...data.map(r => {
          const v = r[ch.field!];
          return typeof v === 'number' ? v : Infinity;
        }));
        if (minInData > lo && syntheticRow[ch.field!] === undefined) {
          syntheticRow[ch.field!] = lo;
          needsInjection = true;
        }
      }
    }
  }

  if (!needsInjection) return data;
  return [...data, syntheticRow];
}

export default function AirChart({ component }: AirComponentProps) {
  const { datasets, loadDataset, resolveGraphic, selections, updateSelection, clearSelection, triggerInteraction } = useReportContext();
  const { seamless, colIndex, totalCols } = useGridContext();
  const c = component as unknown as AirspecChartComponent;
  const datasetId = c.datasetId;
  const title = c.title;

  const isLeftEdge = colIndex === 0;
  const isRightEdge = colIndex === totalCols - 1;
  const seamlessPad = seamless && totalCols > 1
    ? `py-6 ${isLeftEdge ? 'pl-6' : ''} ${isRightEdge ? 'pr-6' : ''}`
    : seamless ? 'py-6' : '';

  const datasetState = datasets[datasetId];

  useEffect(() => {
    if (datasetId && !datasetState) {
      loadDataset(datasetId);
    }
  }, [datasetId, datasetState, loadDataset]);

  const { graphic, bindingError } = resolveGraphic(c);

  const handleSelectionChange = (selectionId: string, type: 'point' | 'interval', fields: string[], value: unknown, row: Record<string, unknown>) => {
    updateSelection(selectionId, type, fields, value);
    triggerInteraction(c.id, 'select', selectionId, row);
  };

  const handleBackgroundClick = () => {
    if (!graphic || !('selections' in graphic) || !graphic.selections) return;
    for (const sel of graphic.selections) {
      clearSelection(sel.id);
      triggerInteraction(c.id, 'selectionClear', sel.id);
    }
  };

  const cardCls = seamless
    ? `${seamlessPad} bg-white h-full flex flex-col`
    : 'p-6 bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col';

  if (datasetState?.loading) {
    return (
      <div className={seamless ? `${seamlessPad} bg-white flex items-center justify-center h-64` : 'p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-64'}>
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (datasetState?.error) {
    return (
      <div className={seamless ? `${seamlessPad} bg-red-50` : 'p-6 bg-red-50 rounded-xl border border-red-200'}>
        <p className="text-sm text-red-600">{datasetState.error}</p>
      </div>
    );
  }

  const rawData = datasetState?.data ?? [];
  const data = useMemo(
    () => graphic ? enforceDomainBounds(graphic, rawData) : rawData,
    [graphic, rawData]
  );

  return (
    <div className={cardCls} onClick={handleBackgroundClick}>
      {title && <h3 className="text-sm font-semibold text-slate-700 mb-4">{title}</h3>}
      {bindingError ? (
        <div className="flex items-center justify-center flex-1 min-h-[12rem] text-sm text-amber-600 bg-amber-50 rounded-lg border border-amber-200 px-4 text-center">
          {bindingError}
        </div>
      ) : !graphic ? (
        <div className="text-sm text-amber-600">Chart missing graphic or graphicBinding</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center flex-1 min-h-[12rem] text-sm text-slate-400">No data available</div>
      ) : (
        <div
          className={`w-full relative ${seamless && totalCols > 1 ? 'overflow-visible' : 'overflow-hidden'}`}
          style={{
            height: '360px',
            ...(seamless && totalCols > 1 ? {
              marginLeft: isLeftEdge ? undefined : '-24px',
              marginRight: isRightEdge ? undefined : '-24px',
              width: `calc(100%${!isLeftEdge ? ' + 24px' : ''}${!isRightEdge ? ' + 24px' : ''})`,
            } : {}),
          }}
        >
          <RenderGraphic
            graphic={graphic}
            data={data}
            selectionStates={selections}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      )}
    </div>
  );
}
