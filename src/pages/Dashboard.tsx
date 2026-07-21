import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileBarChart, Database, Loader2, Sparkles, ArrowRight, Clock } from 'lucide-react';
import { reportService, dataSourceService } from '../services';
import type { Report, DataSource, ReportVersion, AirspecDocument } from '../types/airspec';
import { useReportChat } from '../hooks/useReportChat';
import ReportBuilderModal from '../components/features/ReportBuilderModal';
import { ReportProvider } from '../components/features/reports/renderer/ReportContext';
import LayoutWalker from '../components/features/reports/renderer/LayoutWalker';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MasonryCard({
  report,
  spec,
  versionId,
  onClick,
}: {
  report: Report;
  spec: AirspecDocument | null;
  versionId: string | null;
  onClick: () => void;
}) {
  const age = formatRelativeTime(report.updated_at);

  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg shadow-sm transition-all duration-200 overflow-hidden break-inside-avoid mb-4 block"
    >
      {/* Scaled report preview — zoom collapses the layout space to match visual size */}
      {spec && spec.layout ? (
        <div className="overflow-hidden bg-slate-50/50 rounded-t-2xl">
          <div
            className="pointer-events-none select-none"
            style={{ zoom: 0.45, maxHeight: '600px', overflow: 'hidden' }}
          >
            <div className="p-5">
              <ReportProvider document={spec} versionId={versionId}>
                <LayoutWalker node={spec.layout} />
              </ReportProvider>
            </div>
          </div>
          {/* Fade overlay at bottom */}
          <div className="h-8 bg-gradient-to-t from-white to-transparent -mt-8 relative z-10" />
        </div>
      ) : (
        <div className="flex items-center justify-center h-32 bg-slate-50/50 rounded-t-2xl">
          <FileBarChart size={32} className="text-slate-200" />
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 leading-tight truncate">
            {report.name}
          </h3>
          <ArrowRight
            size={14}
            className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0"
          />
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Clock size={10} className="text-slate-400" />
          <span className="text-[11px] text-slate-400 font-medium">{age}</span>
          {report.model && (
            <>
              <span className="text-slate-300 mx-0.5">·</span>
              <span className="text-[11px] text-slate-400 font-medium truncate">{report.model}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [versions, setVersions] = useState<Record<string, ReportVersion>>({});
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);

  const chat = useReportChat();

  useEffect(() => {
    async function load() {
      try {
        const [r, s] = await Promise.all([
          reportService.getReports(),
          dataSourceService.getDataSources(),
        ]);
        setReports(r);
        setSources(s);

        const versionIds = r
          .map((rep) => rep.current_version_id)
          .filter((id): id is string => id !== null);

        if (versionIds.length > 0) {
          const versionList = await reportService.getVersionsByIds(versionIds);
          const versionMap: Record<string, ReportVersion> = {};
          for (const v of versionList) {
            versionMap[v.id] = v;
          }
          setVersions(versionMap);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (name: string) => {
    if (chat.reportId) {
      await reportService.saveReport(chat.reportId, name);
      setBuilderOpen(false);
      chat.reset();
      const updated = await reportService.getReports();
      setReports(updated);
    }
  };

  const enabledSources = sources.filter((s) => s.enabled);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your AIRspec reporting system</p>
        </div>
        <button
          onClick={() => setBuilderOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Report
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 rounded-lg">
                  <FileBarChart size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{reports.length}</p>
                  <p className="text-xs text-slate-500 font-medium">Reports</p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 rounded-lg">
                  <Database size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{enabledSources.length}</p>
                  <p className="text-xs text-slate-500 font-medium">Active Data Sources</p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 rounded-lg">
                  <Sparkles size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{sources.length}</p>
                  <p className="text-xs text-slate-500 font-medium">Total Sources</p>
                </div>
              </div>
            </div>
          </div>

          {enabledSources.length === 0 && (
            <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-xl">
              <h3 className="font-semibold text-amber-800">Get started</h3>
              <p className="text-sm text-amber-700 mt-1">
                Add a data source in the Datasets section and enable it for AI to start creating reports.
              </p>
              <button
                onClick={() => navigate('/datasets')}
                className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
              >
                Go to Datasets
              </button>
            </div>
          )}

          {/* Masonry grid */}
          {reports.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-slate-900">Reports</h2>
                {reports.length > 12 && (
                  <button
                    onClick={() => navigate('/reports')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    View all
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div
                style={{
                  columnCount: 2,
                  columnGap: '1rem',
                }}
              >
                {reports.map((report) => {
                  const version = report.current_version_id
                    ? versions[report.current_version_id]
                    : null;
                  const spec = (version?.report_spec_json as AirspecDocument) ?? null;
                  return (
                    <MasonryCard
                      key={report.id}
                      report={report}
                      spec={spec}
                      versionId={version?.id ?? null}
                      onClick={() => navigate(`/reports/${report.id}`)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <ReportBuilderModal
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false);
          chat.reset();
        }}
        messages={chat.messages}
        isLoading={chat.isLoading}
        isChatting={chat.isChatting}
        isGenerating={chat.isGenerating}
        isUploading={chat.isUploading}
        readyToGenerate={chat.readyToGenerate}
        error={chat.error}
        currentSpec={chat.currentSpec}
        reportId={chat.reportId}
        versionId={chat.versionId}
        pendingAttachments={chat.pendingAttachments}
        onSendMessage={chat.sendMessage}
        onGenerate={chat.generate}
        onSave={handleSave}
        onAddAttachments={chat.addAttachments}
        onRemoveAttachment={chat.removeAttachment}
      />
    </div>
  );
}
