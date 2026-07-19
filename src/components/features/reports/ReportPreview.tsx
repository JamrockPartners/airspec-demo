import type { AirspecDocument, ReportVersion } from '../../../types/airspec';
import { ReportProvider } from './renderer/ReportContext';
import LayoutWalker from './renderer/LayoutWalker';
import { validateDocument } from './renderer/validateDocument';
import VersionBadge from './VersionBadge';

interface ReportPreviewProps {
  spec: AirspecDocument;
  reportId?: string | null;
  versionId?: string | null;
  version?: Pick<ReportVersion, 'version_number' | 'validation_status' | 'validation_errors_json' | 'created_at' | 'generation_model'> | null;
}

export default function ReportPreview({ spec, versionId, version }: ReportPreviewProps) {
  if (!spec || !spec.layout) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        Invalid or empty report specification
      </div>
    );
  }

  const validationErrors = validateDocument(spec);
  if (validationErrors.length > 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-semibold text-red-900">
          Report failed validation ({validationErrors.length} error{validationErrors.length > 1 ? 's' : ''})
        </h3>
        <p className="mt-1 text-xs text-red-700">
          This document was not rendered because it violates the AIRspec 1.1 schema.
        </p>
        <ul className="mt-4 space-y-1.5">
          {validationErrors.map((err, i) => (
            <li key={i} className="text-xs text-red-800">
              <span className="font-mono text-red-600">{err.path}</span>: {err.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {version && <VersionBadge version={version} />}
      <ReportProvider document={spec} versionId={versionId ?? null}>
        <LayoutWalker node={spec.layout} />
      </ReportProvider>
    </div>
  );
}
