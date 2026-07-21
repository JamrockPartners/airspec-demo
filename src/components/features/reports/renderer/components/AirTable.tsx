import { useEffect } from 'react';
import { Loader2, HelpCircle } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import { useReportContext } from '../ReportContext';
import type { AirspecTableComponent } from '../../../../../types/airspec';
import { formatNumber } from './AirMetric';

interface ColumnDef {
  field: string;
  label?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  format?: { type: string; currency?: string; maximumFractionDigits?: number; minimumFractionDigits?: number; notation?: string };
}

export default function AirTable({ component }: AirComponentProps) {
  const { datasets, loadDataset, diagnoseEmpty } = useReportContext();
  const c = component as unknown as AirspecTableComponent;
  const datasetId = c.datasetId;
  const title = c.title;
  const columns = c.columns ?? [];

  const datasetState = datasets[datasetId];

  useEffect(() => {
    if (datasetId && !datasetState) {
      loadDataset(datasetId);
    }
  }, [datasetId, datasetState, loadDataset]);

  if (datasetState?.loading) {
    return (
      <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-32">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (datasetState?.error) {
    return (
      <div className="p-4 bg-red-50 rounded-xl border border-red-200">
        <p className="text-sm text-red-600">{datasetState.error}</p>
      </div>
    );
  }

  const data = datasetState?.data ?? [];

  const effectiveColumns: ColumnDef[] =
    columns.length > 0
      ? columns
      : data.length > 0
        ? Object.keys(data[0]).map((key) => ({ field: key, label: key }))
        : [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {title && (
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        </div>
      )}
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-sm text-slate-400">
          No data
          <button
            onClick={() => diagnoseEmpty(datasetId)}
            className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
          >
            <HelpCircle size={12} />
            Why no data?
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                {effectiveColumns.map((col) => (
                  <th
                    key={col.field}
                    className={`text-${col.align ?? 'left'} px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap`}
                    style={col.width ? { width: `${col.width}px` } : undefined}
                  >
                    {col.label ?? col.field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.slice(0, 100).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  {effectiveColumns.map((col) => (
                    <td key={col.field} className={`px-4 py-2.5 text-slate-700 whitespace-nowrap text-${col.align ?? 'left'}`}>
                      {row[col.field] == null ? (
                        <span className="text-slate-300">--</span>
                      ) : col.format ? (
                        formatCellValue(row[col.field], col.format)
                      ) : (
                        formatCellValue(row[col.field])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.length > 100 && (
        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
          Showing 100 of {data.length} rows
        </div>
      )}
    </div>
  );
}

function formatCellValue(val: unknown, format?: ColumnDef['format']): string {
  if (format) {
    const num = Number(val);
    if (!isNaN(num)) return formatNumber(num, format as never);
  }
  if (typeof val === 'number') return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(val);
}
