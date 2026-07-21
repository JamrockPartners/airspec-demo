import { useEffect } from 'react';
import { Loader2, HelpCircle } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import { useReportContext } from '../ReportContext';
import { useGridContext } from '../GridContext';
import { RenderGraphic } from '../airmark/RenderGraphic';
import type { AirspecChartComponent } from '../../../../../types/airspec';

export default function AirChart({ component }: AirComponentProps) {
  const { datasets, loadDataset, resolveGraphic, selections, updateSelection, clearSelection, triggerInteraction, diagnoseEmpty } = useReportContext();
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

  const rawData = datasetState?.data ?? [];
  const data = rawData;

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
        <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] text-sm text-slate-400">
          No data available
          <button
            onClick={() => diagnoseEmpty(datasetId)}
            className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
          >
            <HelpCircle size={12} />
            Why no data?
          </button>
        </div>
      ) : (
        <div
          className={`w-full relative overflow-hidden`}
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
