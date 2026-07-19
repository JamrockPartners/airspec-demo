import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Database, ToggleLeft, ToggleRight, Trash2, Eye, ArrowLeft, Loader2, Link2, RefreshCw } from 'lucide-react';
import { dataSourceService } from '../services';
import type { DataSource } from '../types/airspec';
import AddDataSourceModal from '../components/features/AddDataSourceModal';
import ConfirmModal from '../components/ui/ConfirmModal';

interface ApiPreviewState {
  rows: Record<string, unknown>[];
  totalRows: number;
  truncated: boolean;
  fetchedAt: number;
}

export default function Datasets() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DataSource | null>(null);
  const [previewSource, setPreviewSource] = useState<DataSource | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [apiPreview, setApiPreview] = useState<ApiPreviewState | null>(null);

  const loadSources = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dataSourceService.getDataSources();
      setSources(data);
    } catch (err) {
      console.error('Failed to load data sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (datasetId && sources.length > 0 && !previewSource) {
      const match = sources.find((s) => s.id === datasetId || s.slug === datasetId);
      if (match) handlePreview(match);
    }
  }, [datasetId, sources]);

  const handleToggle = async (source: DataSource) => {
    try {
      await dataSourceService.toggleDataSourceEnabled(source.id, !source.enabled);
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, enabled: !s.enabled } : s))
      );
    } catch (err) {
      console.error('Failed to toggle source:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await dataSourceService.deleteDataSource(deleteTarget.id);
      setSources((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete source:', err);
    }
    setDeleteTarget(null);
  };

  const handlePreview = async (source: DataSource) => {
    setPreviewSource(source);
    setPreviewRows([]);
    setApiPreview(null);
    setPreviewLoading(true);
    try {
      if (source.source_type === 'api') {
        const result = await dataSourceService.previewApiDataSource(source.id);
        setApiPreview({
          rows: result.rows,
          totalRows: result.totalRows,
          truncated: result.truncated,
          fetchedAt: Date.now(),
        });
      } else {
        const rows = await dataSourceService.getDatasetRows(source.id, 50);
        setPreviewRows(rows);
      }
    } catch (err) {
      console.error('Failed to load rows:', err);
      setPreviewRows([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (previewSource) {
    return (
      <div>
        <button
          onClick={() => {
            setPreviewSource(null);
            setPreviewRows([]);
            setApiPreview(null);
            navigate('/datasets');
          }}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to datasets
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{previewSource.name}</h1>
            {previewSource.enabled ? (
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                Active
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-full">
                Disabled
              </span>
            )}
          </div>
          {previewSource.description && (
            <p className="text-slate-500 mt-1">{previewSource.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-slate-400">
              {previewSource.fields_json.length} columns
            </span>
            {previewSource.source_type === 'api' ? (
              <>
                <span className="text-xs text-amber-600 font-medium">
                  LIVE API · {apiPreview ? apiPreview.totalRows : '...'} rows
                </span>
                <button
                  onClick={() => handlePreview(previewSource)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">{previewSource.row_count} rows</span>
            )}
            <span className="text-xs text-slate-400 capitalize">
              Source: {previewSource.source_type}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Schema</h3>
          <div className="flex flex-wrap gap-2">
            {previewSource.fields_json.map((f) => (
              <span
                key={f.name}
                className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-md font-mono"
              >
                {f.name}
                <span className="text-slate-400 ml-1">{f.type}</span>
              </span>
            ))}
          </div>
        </div>

        {previewLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {previewSource.source_type === 'api' && apiPreview && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                <Link2 size={14} />
                Fetched live from <span className="font-mono truncate max-w-[400px]">{previewSource.api_url}</span>
                {apiPreview.truncated && ' · capped at 10,000 rows'}
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-500">
                  Showing {previewSource.source_type === 'api' && apiPreview ? apiPreview.rows.length : previewRows.length} of{' '}
                  {previewSource.source_type === 'api' && apiPreview ? apiPreview.totalRows : previewSource.row_count} rows
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {previewSource.fields_json.map((f) => (
                        <th
                          key={f.name}
                          className="text-left px-4 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider whitespace-nowrap"
                        >
                          {f.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(previewSource.source_type === 'api' && apiPreview ? apiPreview.rows : previewRows).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        {previewSource.fields_json.map((f) => (
                          <td
                            key={f.name}
                            className="px-4 py-2 text-slate-700 whitespace-nowrap text-xs"
                          >
                            {row[f.name] == null ? (
                              <span className="text-slate-300">null</span>
                            ) : (
                              String(row[f.name])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
          <p className="text-slate-500 mt-1">
            Manage datasets available for AI report generation
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Data Source
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      ) : sources.length === 0 ? (
        <div className="mt-16 text-center">
          <Database size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No data sources yet</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            Add a CSV file to get started. Data sources become available to the AI report generator
            once enabled.
          </p>
          <button
            onClick={() => setAddModalOpen(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add your first data source
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className={`flex items-center gap-4 p-4 bg-white rounded-xl border transition-all ${
                source.enabled
                  ? 'border-slate-200 shadow-sm'
                  : 'border-slate-100 opacity-60'
              }`}
            >
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600 shrink-0">
                <Database size={20} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 truncate">{source.name}</h3>
                  {source.enabled && (
                    <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded">
                      AI-ENABLED
                    </span>
                  )}
                </div>
                {source.description && (
                  <p className="text-sm text-slate-500 mt-0.5 truncate">{source.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-400">
                    {source.fields_json.length} cols
                  </span>
                  {source.source_type === 'api' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                      <Link2 size={11} />
                      LIVE API
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">{source.row_count} rows</span>
                  )}
                  <span className="text-xs text-slate-400 capitalize">{source.source_type}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { navigate(`/datasets/${source.slug || source.id}`); handlePreview(source); }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Preview data"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={() => handleToggle(source)}
                  className={`p-2 rounded-lg transition-colors ${
                    source.enabled
                      ? 'text-emerald-600 hover:bg-emerald-50'
                      : 'text-slate-400 hover:bg-slate-100'
                  }`}
                  title={source.enabled ? 'Disable for AI' : 'Enable for AI'}
                >
                  {source.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
                <button
                  onClick={() => setDeleteTarget(source)}
                  className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddDataSourceModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setAddModalOpen(false);
          loadSources();
        }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Data Source"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This will permanently remove all associated data and cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
