import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileBarChart, Database, Loader2, Sparkles, ArrowRight, Clock } from 'lucide-react';
import { reportService, dataSourceService } from '../services';
import type { Report, DataSource } from '../types/airspec';
import { useReportChat } from '../hooks/useReportChat';
import ReportBuilderModal from '../components/features/ReportBuilderModal';

type BentoSize = 'large' | 'medium' | 'small';

const BENTO_PATTERN: BentoSize[] = [
  'large', 'medium', 'medium',
  'small', 'small', 'small',
  'medium', 'large',
  'small', 'small', 'medium',
];

function getBentoSize(index: number): BentoSize {
  return BENTO_PATTERN[index % BENTO_PATTERN.length];
}

const ACCENT_PALETTES = [
  { bg: 'bg-blue-50', border: 'border-blue-100', icon: 'text-blue-500', hover: 'hover:border-blue-300 hover:shadow-blue-100/50' },
  { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'text-emerald-500', hover: 'hover:border-emerald-300 hover:shadow-emerald-100/50' },
  { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-500', hover: 'hover:border-amber-300 hover:shadow-amber-100/50' },
  { bg: 'bg-rose-50', border: 'border-rose-100', icon: 'text-rose-500', hover: 'hover:border-rose-300 hover:shadow-rose-100/50' },
  { bg: 'bg-cyan-50', border: 'border-cyan-100', icon: 'text-cyan-500', hover: 'hover:border-cyan-300 hover:shadow-cyan-100/50' },
  { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'text-slate-500', hover: 'hover:border-slate-300 hover:shadow-slate-100/50' },
];

function BentoCard({ report, index, onClick }: { report: Report; index: number; onClick: () => void }) {
  const size = getBentoSize(index);
  const palette = ACCENT_PALETTES[index % ACCENT_PALETTES.length];
  const age = formatRelativeTime(report.updated_at);

  const sizeClasses = {
    large: 'col-span-2 row-span-2 md:col-span-2',
    medium: 'col-span-2 row-span-1 md:col-span-1',
    small: 'col-span-1 row-span-1',
  };

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col justify-between p-5 rounded-2xl border ${palette.border} ${palette.bg} ${palette.hover} shadow-sm hover:shadow-md transition-all duration-200 text-left overflow-hidden ${sizeClasses[size]}`}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${palette.bg} blur-2xl`} />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className={`p-2 rounded-lg ${palette.bg} border ${palette.border}`}>
            <FileBarChart size={size === 'large' ? 22 : 16} className={palette.icon} />
          </div>
          <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all mt-1" />
        </div>

        <div className="mt-3 flex-1">
          <h3 className={`font-semibold text-slate-900 leading-tight ${size === 'large' ? 'text-lg' : 'text-sm'} ${size === 'small' ? 'line-clamp-2' : ''}`}>
            {report.name}
          </h3>
          {report.description && size !== 'small' && (
            <p className={`text-slate-500 mt-1.5 ${size === 'large' ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2'}`}>
              {report.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-3">
          <Clock size={11} className="text-slate-400" />
          <span className="text-[11px] text-slate-400 font-medium">{age}</span>
          {report.model && size !== 'small' && (
            <>
              <span className="text-slate-300 mx-1">·</span>
              <span className="text-[11px] text-slate-400 font-medium truncate">{report.model}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

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

export default function Dashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
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

          {/* Get started */}
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

          {/* Bento Grid Reports */}
          {reports.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-slate-900">Reports</h2>
                {reports.length > 11 && (
                  <button
                    onClick={() => navigate('/reports')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    View all
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-[140px]">
                {reports.map((report, i) => (
                  <BentoCard
                    key={report.id}
                    report={report}
                    index={i}
                    onClick={() => navigate(`/reports/${report.id}`)}
                  />
                ))}
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
