import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileBarChart, Database, Loader2, Sparkles } from 'lucide-react';
import { reportService, dataSourceService } from '../services';
import type { Report, DataSource } from '../types/airspec';
import { useReportChat } from '../hooks/useReportChat';
import ReportBuilderModal from '../components/features/ReportBuilderModal';

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
          {/* Stats */}
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

          {/* Quick Actions */}
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

          {/* Recent Reports */}
          {reports.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Reports</h2>
              <div className="space-y-2">
                {reports.slice(0, 5).map((report) => (
                  <button
                    key={report.id}
                    onClick={() => navigate(`/reports/${report.id}`)}
                    className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all text-left"
                  >
                    <FileBarChart size={18} className="text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{report.name}</p>
                      {report.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{report.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(report.updated_at).toLocaleDateString()}
                    </span>
                  </button>
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
