import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, History, RotateCcw, RectangleVertical, RectangleHorizontal } from 'lucide-react';
import { reportService } from '../services';
import type { Report, ReportVersion, AirspecDocument } from '../types/airspec';
import ReportPreview from '../components/features/reports/ReportPreview';

export default function ReportViewer() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [version, setVersion] = useState<ReportVersion | null>(null);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    async function load() {
      try {
        const result = await reportService.getReportWithVersion(reportId!);
        if (result) {
          setReport(result.report);
          setVersion(result.version);
        }
        const allVersions = await reportService.getReportVersions(reportId!);
        setVersions(allVersions);
      } catch (err) {
        console.error('Failed to load report:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reportId]);

  const handleRestoreVersion = async (versionId: string) => {
    if (!reportId) return;
    try {
      await reportService.restoreVersion(reportId, versionId);
      const restored = versions.find((v) => v.id === versionId);
      if (restored) setVersion(restored);
      setShowHistory(false);
    } catch (err) {
      console.error('Failed to restore version:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!report || !version) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Report not found</p>
        <button onClick={() => navigate('/reports')} className="mt-3 text-sm text-blue-600 hover:text-blue-700">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/reports')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to reports
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-2">
            <button
              onClick={async () => {
                const next = report.card_layout === 'tall' ? null : 'tall' as const;
                await reportService.updateCardLayout(report.id, next);
                setReport({ ...report, card_layout: next });
              }}
              className={`p-1.5 rounded-md transition-all ${
                report.card_layout !== 'wide' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-500'
              }`}
              title="Tall card on dashboard"
            >
              <RectangleVertical size={14} />
            </button>
            <button
              onClick={async () => {
                const next = report.card_layout === 'wide' ? null : 'wide' as const;
                await reportService.updateCardLayout(report.id, next);
                setReport({ ...report, card_layout: next });
              }}
              className={`p-1.5 rounded-md transition-all ${
                report.card_layout === 'wide' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-500'
              }`}
              title="Wide card on dashboard"
            >
              <RectangleHorizontal size={14} />
            </button>
          </div>
          <span className="text-xs text-slate-400">v{version.version_number}</span>
          {versions.length > 1 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <History size={13} />
              {showHistory ? 'Hide History' : 'Version History'}
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Version History</h3>
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  v.id === version.id
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      Version {v.version_number}
                    </span>
                    {v.id === version.id && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(v.created_at).toLocaleString()} - {v.generation_model}
                  </p>
                </div>
                {v.id !== version.id && (
                  <button
                    onClick={() => handleRestoreVersion(v.id)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <RotateCcw size={12} />
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ReportPreview
        spec={version.report_spec_json as AirspecDocument}
        reportId={report.id}
        versionId={version.id}
        version={version}
      />
    </div>
  );
}
