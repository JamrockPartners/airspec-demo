import { useState, useCallback } from 'react';
import { Upload, FileText, Link2, Loader2, RefreshCw, CheckCircle2, AlertCircle, Braces } from 'lucide-react';
import Modal from '../ui/Modal';
import { parseCsvText, coerceRowValues } from '../../lib/csvParser';
import { dataSourceService } from '../../services';
import type { DataSourceField } from '../../types/airspec';

type SourceKind = 'csv' | 'json' | 'api';

interface ApiSample {
  rows: Record<string, unknown>[];
  fields: DataSourceField[];
  format: 'json' | 'csv';
  rootPath: string | null;
  totalRows: number;
  truncated: boolean;
}

interface AddDataSourceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}



function inferFieldsFromRows(rows: Record<string, unknown>[]): DataSourceField[] {
  if (rows.length === 0) return [];
  const sampleSize = Math.min(rows.length, 100);
  const fieldNames = new Set<string>();
  for (const row of rows.slice(0, sampleSize)) {
    for (const key of Object.keys(row)) fieldNames.add(key);
  }
  return [...fieldNames].map((name) => {
    let numericCount = 0;
    let booleanCount = 0;
    let objectCount = 0;
    let arrayCount = 0;
    let nonEmptyCount = 0;
    for (const row of rows.slice(0, sampleSize)) {
      const val = row[name];
      if (val === null || val === undefined) continue;
      if (Array.isArray(val)) { nonEmptyCount++; arrayCount++; continue; }
      if (typeof val === 'object') { nonEmptyCount++; objectCount++; continue; }
      const str = String(val).trim();
      if (str === '' || str === 'NaN' || str === 'null' || str === 'undefined') continue;
      nonEmptyCount++;
      if (!isNaN(Number(str)) && str !== '') numericCount++;
      if (str === 'true' || str === 'false') booleanCount++;
    }
    let type: DataSourceField['type'] = 'string';
    if (nonEmptyCount > 0) {
      if (objectCount / nonEmptyCount > 0.5) type = 'object';
      else if (arrayCount / nonEmptyCount > 0.5) type = 'array';
      else if (numericCount / nonEmptyCount > 0.9) type = 'number';
      else if (booleanCount / nonEmptyCount > 0.9) type = 'boolean';
    }
    return { name, type };
  });
}

function formatSampleValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const compact = JSON.stringify(value);
    return compact.length > 80 ? `[${value.length} items]` : compact;
  }
  if (typeof value === 'object') {
    const compact = JSON.stringify(value);
    return compact.length > 80 ? `{${Object.keys(value as Record<string, unknown>).length} keys}` : compact;
  }
  return String(value);
}

export default function AddDataSourceModal({ open, onClose, onSuccess }: AddDataSourceModalProps) {
  const [kind, setKind] = useState<SourceKind>('csv');
  const [step, setStep] = useState<'upload' | 'configure'>('upload');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<DataSourceField[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // JSON paste state
  const [jsonText, setJsonText] = useState('');
  const [jsonRootPath, setJsonRootPath] = useState('');

  // API mode state
  const [apiUrl, setApiUrl] = useState('');
  const [apiFormat, setApiFormat] = useState<'json' | 'csv' | ''>('');
  const [apiRootPath, setApiRootPath] = useState('');
  const [apiSample, setApiSample] = useState<ApiSample | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');

  const reset = useCallback(() => {
    setStep('upload');
    setName('');
    setDescription('');
    setFields([]);
    setRows([]);
    setFileName('');
    setError('');
    setLoading(false);
    setJsonText('');
    setJsonRootPath('');
    setApiUrl('');
    setApiFormat('');
    setApiRootPath('');
    setApiSample(null);
    setTesting(false);
    setTestError('');
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;

      if (file.name.endsWith('.json')) {
        setJsonText(text);
        processJsonText(text, '');
        setFileName(file.name);
        setName(file.name.replace(/\.\w+$/, '').replace(/[_-]/g, ' '));
        return;
      }

      const parsed = parseCsvText(text);
      if (parsed.fields.length === 0) {
        setError('Could not parse the CSV file. Ensure it has a header row and at least one data row.');
        return;
      }
      setFields(parsed.fields);
      setRows(parsed.rows);
      setFileName(file.name);
      setName(file.name.replace(/\.\w+$/, '').replace(/[_-]/g, ' '));
      setStep('configure');
    };
    reader.onerror = () => setError('Failed to read the file.');
    reader.readAsText(file);
  };

  const processJsonText = (text: string, rootPath: string) => {
    try {
      let parsed: unknown = JSON.parse(text);
      if (rootPath.trim()) {
        const parts = rootPath.trim().split('.').filter(Boolean);
        for (const p of parts) {
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && p in (parsed as Record<string, unknown>)) {
            parsed = (parsed as Record<string, unknown>)[p];
          } else {
            setError(`Path "${rootPath}" not found in JSON structure.`);
            return;
          }
        }
      }

      let rawRows: Record<string, unknown>[];
      if (Array.isArray(parsed)) {
        rawRows = parsed.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[];
      } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        const firstArrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
        if (firstArrayKey) {
          rawRows = (obj[firstArrayKey] as unknown[]).filter(
            (v) => v && typeof v === 'object' && !Array.isArray(v)
          ) as Record<string, unknown>[];
          if (!rootPath.trim()) setJsonRootPath(firstArrayKey);
        } else {
          rawRows = [obj];
        }
      } else {
        setError('JSON must be an array of objects or an object containing an array.');
        return;
      }

      if (rawRows.length === 0) {
        setError('No rows found in the JSON data.');
        return;
      }

      const detectedFields = inferFieldsFromRows(rawRows);
      setFields(detectedFields);
      setRows(rawRows);
      setError('');
      setStep('configure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleParseJson = () => {
    if (!jsonText.trim()) {
      setError('Please paste JSON data.');
      return;
    }
    processJsonText(jsonText, jsonRootPath);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    const input = document.createElement('input');
    input.type = 'file';
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    handleFileSelect({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const handleTestApi = async () => {
    if (!apiUrl.trim()) {
      setTestError('Please enter a URL.');
      return;
    }
    setTesting(true);
    setTestError('');
    setApiSample(null);
    try {
      const result = await dataSourceService.fetchApiSample({
        url: apiUrl.trim(),
        format: apiFormat || undefined,
        rootPath: apiRootPath.trim() || undefined,
      });
      if (!result.fields.length) {
        setTestError('The endpoint returned data but no fields could be detected.');
        setTesting(false);
        return;
      }
      const detectedFields = inferFieldsFromRows(result.rows);
      setApiSample({
        rows: result.rows,
        fields: detectedFields,
        format: result.format,
        rootPath: result.rootPath,
        totalRows: result.totalRows,
        truncated: result.truncated,
      });
      setFields(detectedFields);
      setRows(result.rows.slice(0, 50));
      if (!name.trim()) {
        const derived = apiUrl.trim().replace(/^https?:\/\//, '').split('/')[0];
        setName(derived);
      }
      if (!apiFormat) setApiFormat(result.format);
      if (!apiRootPath && result.rootPath) setApiRootPath(result.rootPath);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to fetch the endpoint.');
    } finally {
      setTesting(false);
    }
  };

  const handleProceedToConfigure = () => {
    if (!apiSample) return;
    setStep('configure');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Please provide a name for this data source.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (kind === 'csv' || kind === 'json') {
        const coercedRows = coerceRowValues(rows, fields);
        const source = await dataSourceService.createDataSource({
          name: name.trim(),
          description: description.trim() || undefined,
          source_type: 'csv',
          fields_json: fields,
          row_count: coercedRows.length,
        });
        await dataSourceService.uploadDatasetRows(source.id, coercedRows);
      } else {
        await dataSourceService.createDataSource({
          name: name.trim(),
          description: description.trim() || undefined,
          source_type: 'api',
          fields_json: fields,
          row_count: apiSample?.totalRows ?? 0,
          api_url: apiUrl.trim(),
          api_format: (apiFormat || apiSample?.format || 'json') as 'json' | 'csv',
          api_root_path: apiRootPath.trim() || null,
        });
      }
      reset();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create data source');
    } finally {
      setLoading(false);
    }
  };

  const summaryLabel = kind === 'api'
    ? `${fields.length} columns, ${apiSample?.totalRows ?? 0} rows${apiSample?.truncated ? ' (capped)' : ''} · ${apiSample?.format ?? ''}`
    : `${fields.length} columns, ${rows.length} rows detected`;

  return (
    <Modal open={open} onClose={handleClose} title="Add Data Source" size="full">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <>
              <div className="mb-5">
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg w-full max-w-md">
                  <button
                    onClick={() => { reset(); setKind('csv'); }}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      kind === 'csv' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Upload size={15} />
                    CSV Upload
                  </button>
                  <button
                    onClick={() => { reset(); setKind('json'); }}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      kind === 'json' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Braces size={15} />
                    JSON
                  </button>
                  <button
                    onClick={() => { reset(); setKind('api'); }}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      kind === 'api' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Link2 size={15} />
                    Live API
                  </button>
                </div>
              </div>

              {kind === 'csv' && (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
                >
                  <Upload size={40} className="mx-auto text-slate-400 mb-4" />
                  <p className="text-slate-700 font-medium">Drop a CSV or JSON file here or click to browse</p>
                  <p className="text-slate-500 text-sm mt-1">
                    CSV files should have a header row. JSON files should contain an array of objects.
                  </p>
                  <label className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                    Choose File
                    <input type="file" accept=".csv,.json" onChange={handleFileSelect} className="hidden" />
                  </label>
                </div>
              )}

              {kind === 'json' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Paste JSON data</label>
                    <textarea
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      rows={14}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      placeholder={'[\n  { "name": "Alice", "age": 30, "address": { "city": "NYC", "zip": "10001" } },\n  { "name": "Bob", "age": 25, "address": { "city": "LA", "zip": "90001" } }\n]'}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Supports nested objects (flattened with dot notation) and arrays. You can also drop a .json file on the CSV tab.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Root path (optional)</label>
                    <input
                      type="text"
                      value={jsonRootPath}
                      onChange={(e) => setJsonRootPath(e.target.value)}
                      placeholder="e.g. data.results"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">If the array of records is nested inside an object, specify the dotted path to it.</p>
                  </div>
                  <button
                    onClick={handleParseJson}
                    disabled={!jsonText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Braces size={15} />
                    Parse & Detect Schema
                  </button>
                </div>
              )}

              {kind === 'api' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Endpoint URL</label>
                    <input
                      type="url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://collectionapi.metmuseum.org/public/collection/v1/departments"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">A public endpoint that returns JSON or CSV. No authentication.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Format (optional)</label>
                      <select
                        value={apiFormat}
                        onChange={(e) => setApiFormat(e.target.value as 'json' | 'csv' | '')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Auto-detect</option>
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Root path (optional)</label>
                      <input
                        type="text"
                        value={apiRootPath}
                        onChange={(e) => setApiRootPath(e.target.value)}
                        placeholder="e.g. departments"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">Dotted path to the records array in JSON.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTestApi}
                      disabled={testing || !apiUrl.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {testing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                      {testing ? 'Fetching...' : 'Test & Detect Schema'}
                    </button>

                    {apiSample && (
                      <button
                        onClick={handleProceedToConfigure}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <CheckCircle2 size={15} />
                        Continue
                      </button>
                    )}
                  </div>

                  {testError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{testError}</span>
                    </div>
                  )}

                  {apiSample && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                        <CheckCircle2 size={16} />
                        Detected {apiSample.fields.length} columns · {apiSample.totalRows} rows · {apiSample.format.toUpperCase()}
                        {apiSample.rootPath && ` · path: ${apiSample.rootPath}`}
                        {apiSample.truncated && ' (capped at 10,000)'}
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-50 z-10">
                            <tr className="border-b border-slate-200">
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Column</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Type</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Sample</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {apiSample.fields.map((f) => (
                              <tr key={f.name}>
                                <td className="px-3 py-2 font-mono text-xs text-slate-800">{f.name}</td>
                                <td className="px-3 py-2">
                                  <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-medium">
                                    {f.type}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[300px]">
                                  {formatSampleValue(apiSample.rows[0]?.[f.name])}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 'configure' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                {kind === 'api' ? <Link2 size={20} className="text-slate-500" /> : kind === 'json' ? <Braces size={20} className="text-slate-500" /> : <FileText size={20} className="text-slate-500" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {kind === 'api' ? apiUrl : fileName || 'Pasted JSON'}
                  </p>
                  <p className="text-xs text-slate-500">{summaryLabel}</p>
                </div>
                {kind === 'api' && (
                  <span className="ml-auto px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded uppercase tracking-wide">
                    Live · fetched at render
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Met Museum Departments"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="What does this dataset contain?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Detected Schema ({fields.length} columns)
                </label>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Column</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Description</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Sample</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fields.map((f, idx) => (
                        <tr key={f.name}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-800">{f.name}</td>
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-medium">
                              {f.type}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={f.description || ''}
                              onChange={(e) => {
                                const updated = [...fields];
                                updated[idx] = { ...updated[idx], description: e.target.value || undefined };
                                setFields(updated);
                              }}
                              placeholder="Optional"
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[200px]">
                            {formatSampleValue(rows[0]?.[f.name])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        {step === 'configure' && (
          <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-white flex items-center justify-between">
            <button
              onClick={() => setStep('upload')}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              {kind === 'csv' ? 'Choose a different file' : kind === 'json' ? 'Back to JSON input' : 'Back to endpoint'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Add Data Source'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
