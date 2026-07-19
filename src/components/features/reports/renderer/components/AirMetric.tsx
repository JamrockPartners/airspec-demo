import { useEffect } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import { useReportContext } from '../ReportContext';
import { useGridContext } from '../GridContext';
import type { AirspecMetricComponent, AirspecFormat } from '../../../../../types/airspec';

export default function AirMetric({ component }: AirComponentProps) {
  const { datasets, loadDataset } = useReportContext();
  const { seamless } = useGridContext();
  const c = component as unknown as AirspecMetricComponent;
  const datasetId = c.datasetId;
  const valueField = c.valueField;
  const format = c.format;
  const subtitle = c.subtitle;
  const prefix = c.prefix;
  const suffix = c.suffix;

  const datasetState = datasets[datasetId];

  useEffect(() => {
    if (datasetId && !datasetState) {
      loadDataset(datasetId);
    }
  }, [datasetId, datasetState, loadDataset]);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '--';
    const num = Number(val);
    if (isNaN(num)) return String(val);

    if (!format) return num.toLocaleString();
    return formatNumber(num, format);
  };

  if (datasetState?.loading) {
    return (
      <div className={seamless ? 'p-5 bg-white' : 'p-5 bg-white rounded-xl border border-slate-200 shadow-sm'}>
        <Loader2 size={18} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (datasetState?.error) {
    return (
      <div className={seamless ? 'p-5 bg-red-50' : 'p-5 bg-red-50 rounded-xl border border-red-200'}>
        <p className="text-xs text-red-600">{datasetState.error}</p>
      </div>
    );
  }

  const row = datasetState?.data?.[0];
  const value = row ? row[valueField] : null;

  return (
    <div className={seamless ? 'p-5 bg-white h-full' : 'p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow h-full'}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{c.title ?? subtitle}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {prefix}{formatValue(value)}{suffix}
          </p>
          {subtitle && c.title && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="p-2 bg-blue-50 rounded-lg">
          <TrendingUp size={16} className="text-blue-600" />
        </div>
      </div>
    </div>
  );
}

export function formatNumber(num: number, format: AirspecFormat): string {
  const opts: Intl.NumberFormatOptions = {};
  if (format.minimumFractionDigits !== undefined) opts.minimumFractionDigits = format.minimumFractionDigits;
  if (format.maximumFractionDigits !== undefined) opts.maximumFractionDigits = format.maximumFractionDigits;
  if (format.notation) opts.notation = format.notation;

  switch (format.type) {
    case 'currency':
      return num.toLocaleString(undefined, { ...opts, style: 'currency', currency: format.currency ?? 'USD' });
    case 'percent':
      return `${(num * 100).toFixed(opts.maximumFractionDigits ?? 1)}%`;
    case 'text':
      return String(num);
    default:
      return num.toLocaleString(undefined, opts);
  }
}
