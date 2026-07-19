import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { ReportVersion } from '../../../../types/airspec';

interface VersionBadgeProps {
  version: Pick<ReportVersion, 'version_number' | 'validation_status' | 'validation_errors_json' | 'created_at' | 'generation_model'>;
}

export default function VersionBadge({ version }: VersionBadgeProps) {
  const isInvalid = version.validation_status === 'invalid';
  const errorCount = version.validation_errors_json?.length ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-semibold rounded">
          v{version.version_number}
        </span>
        {version.validation_status === 'valid' && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 size={12} />
            Valid
          </span>
        )}
        {version.validation_status === 'pending' && (
          <span className="flex items-center gap-1 text-amber-600">
            <Clock size={12} />
            Pending
          </span>
        )}
        {isInvalid && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle size={12} />
            Invalid &mdash; {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-slate-400">
          {new Date(version.created_at).toLocaleString()}
        </span>
        {version.generation_model && (
          <span className="text-slate-400 font-mono">{version.generation_model}</span>
        )}
      </div>

      {isInvalid && errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <ul className="space-y-1">
            {version.validation_errors_json!.map((err, i) => (
              <li key={i} className="text-xs text-red-700 font-mono">{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
