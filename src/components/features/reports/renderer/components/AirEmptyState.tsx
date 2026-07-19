import { Database } from 'lucide-react';
import type { AirComponentProps } from '../componentRegistry';
import type { AirspecEmptyStateComponent } from '../../../../../types/airspec';

export default function AirEmptyState({ component }: AirComponentProps) {
  const c = component as unknown as AirspecEmptyStateComponent;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Database size={40} className="text-slate-300 mb-3" />
      <p className="text-sm text-slate-500">{c.message ?? 'No data available'}</p>
    </div>
  );
}
