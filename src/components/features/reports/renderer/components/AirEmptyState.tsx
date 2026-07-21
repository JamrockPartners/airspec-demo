import { Database, HelpCircle } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import { useReportContext } from '../ReportContext';
import type { AirspecEmptyStateComponent } from '../../../../../types/airspec';

export default function AirEmptyState({ component }: AirComponentProps) {
  const c = component as unknown as AirspecEmptyStateComponent;
  const { diagnoseEmpty } = useReportContext();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Database size={40} className="text-slate-300 mb-3" />
      <p className="text-sm text-slate-500">{c.message ?? 'No data available'}</p>
      <button
        onClick={() => diagnoseEmpty(c.datasetId)}
        className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
      >
        <HelpCircle size={12} />
        Why no data?
      </button>
    </div>
  );
}
