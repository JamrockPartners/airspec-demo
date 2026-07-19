import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileBarChart, Plus, Trash2, Pencil, Eye, Loader2 } from 'lucide-react';
import { reportService } from '../services';
import type { Report } from '../types/airspec';
import { useReportChat } from '../hooks/useReportChat';
import ReportBuilderModal from '../components/features/ReportBuilderModal';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Report | null>(null);

  const chat = useReportChat();

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await reportService.getReports();
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await reportService.archiveReport(archiveTarget.id);
      setReports((prev) => prev.filter((r) => r.id !== archiveTarget.id));
    } catch (err) {
      console.error('Failed to archive report:', err);
    }
    setArchiveTarget(null);
  };

  const handleSave = async (name: string) => {
    if (chat.reportId) {
      await reportService.saveReport(chat.reportId, name);
      setBuilderOpen(false);
      chat.reset();
      loadReports();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 mt-1">AI-generated reports and analytics</p>
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
      ) : reports.length === 0 ? (
        <div className="mt-16 text-center">
          <FileBarChart size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No reports yet</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            Create your first AI-generated report by describing what you need.
          </p>
          <button
            onClick={() => setBuilderOpen(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create your first report
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-2">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-200 transition-all"
            >
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600 shrink-0">
                <FileBarChart size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{report.name}</h3>
                {report.description && (
                  <p className="text-sm text-slate-500 truncate mt-0.5">{report.description}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Updated {new Date(report.updated_at).toLocaleDateString()} at{' '}
                  {new Date(report.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                  title="View report"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={async () => {
                    await chat.loadExisting(report);
                    setBuilderOpen(true);
                  }}
                  className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                  title="Edit report"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setArchiveTarget(report)}
                  className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  title="Archive"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
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
        versionNumber={chat.versionNumber}
        validationErrors={chat.validationErrors}
        generatedModel={chat.generatedModel}
        pendingAttachments={chat.pendingAttachments}
        model={chat.model}
        generationProgress={chat.generationProgress}
        onModelChange={chat.setModel}
        onSendMessage={chat.sendMessage}
        onGenerate={chat.generate}
        onSave={handleSave}
        onAddAttachments={chat.addAttachments}
        onRemoveAttachment={chat.removeAttachment}
      />

      <ConfirmModal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title="Archive Report"
        message={`Are you sure you want to archive "${archiveTarget?.name}"? You can restore it later if needed.`}
        confirmLabel="Archive"
        variant="warning"
      />
    </div>
  );
}
