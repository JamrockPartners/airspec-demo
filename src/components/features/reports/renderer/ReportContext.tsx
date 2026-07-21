import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import type {
  AirspecDocument,
  AirspecComponent,
  AirspecInteraction,
  AirspecAction,
  AirspecChartComponent,
  AirspecGraphic,
  AirspecBinding,
  AirspecDataset,
  AirspecFilter,
} from '../../../../types/airspec';
import { reportService } from '../../../../services';
import DiagnosisModal from '../DiagnosisModal';

interface DatasetState {
  loading: boolean;
  error: string | null;
  data: Record<string, unknown>[] | null;
  totalRows: number;
}

type SelectionValue = unknown;

interface GraphicResolution {
  graphic: AirspecGraphic | null;
  bindingError: string | null;
}

interface ReportContextValue {
  document: AirspecDocument;
  parameters: Record<string, unknown>;
  datasets: Record<string, DatasetState>;
  versionId: string | null;
  selections: Record<string, SelectionValue>;
  setParameter: (id: string, value: unknown) => void;
  clearParameter: (id: string) => void;
  loadDataset: (datasetId: string) => void;
  updateSelection: (selectionId: string, type: 'point' | 'interval', fields: string[], value: unknown, row: Record<string, unknown>) => void;
  clearSelection: (selectionId: string) => void;
  triggerInteraction: (componentId: string, event: string, selectionId?: string, row?: Record<string, unknown>) => void;
  resolveGraphic: (chart: AirspecChartComponent) => GraphicResolution;
  diagnoseEmpty: (datasetId: string) => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function useReportContext(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReportContext must be used within ReportProvider');
  return ctx;
}

interface ReportProviderProps {
  document: AirspecDocument;
  versionId: string | null;
  children: React.ReactNode;
}

export function ReportProvider({ document, versionId, children }: ReportProviderProps) {
  const [parameters, setParameters] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const param of document.parameters ?? []) {
      if (param.default !== undefined) defaults[param.id] = param.default;
    }
    return defaults;
  });

  const [datasets, setDatasets] = useState<Record<string, DatasetState>>({});
  const [selections, setSelections] = useState<Record<string, SelectionValue>>({});
  const [diagnosis, setDiagnosis] = useState<{ open: boolean; loading: boolean; analysis: string | null; error: string | null }>({
    open: false, loading: false, analysis: null, error: null,
  });
  const loadingRef = useRef<Set<string>>(new Set());
  // Monotonic state revision; stale fetches are ignored.
  const revisionRef = useRef(0);

  // Coalesce dataset loads so each dataset executes at most once per revision.
  const pendingLoadRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof Promise<undefined>> | null>(null);
  // Ref to the latest loadDataset, so the coalesced microtask always invokes
  // the version that captured the latest `parameters`. Without this, the
  // scheduler's empty deps would permanently capture the first-render
  // loadDataset and re-fetch with stale parameter state.
  const loadDatasetRef = useRef<(id: string) => void>(() => {});

  const scheduleDatasetLoads = useCallback((ids: string[]) => {
    for (const id of ids) pendingLoadRef.current.add(id);
    if (flushTimerRef.current) return;
    flushTimerRef.current = Promise.resolve().then(() => {
      flushTimerRef.current = null;
      const toLoad = [...pendingLoadRef.current];
      pendingLoadRef.current.clear();
      for (const id of toLoad) loadDatasetRef.current(id);
    });
  }, []);

  const setParameter = useCallback((id: string, value: unknown) => {
    revisionRef.current += 1;
    setParameters((prev) => ({ ...prev, [id]: value }));
    // Invalidate and reload all datasets affected by this parameter.
    const affected = findAffectedDatasets(document, id);
    setDatasets((prev) => {
      const next = { ...prev };
      for (const dsId of affected) {
        if (next[dsId]) next[dsId] = { ...next[dsId], loading: true, data: null };
      }
      return next;
    });
    loadingRef.current.clear();
    scheduleDatasetLoads(affected);
  }, [document, scheduleDatasetLoads]);

  const clearParameter = useCallback((id: string) => {
    revisionRef.current += 1;
    setParameters((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const affected = findAffectedDatasets(document, id);
    setDatasets((prev) => {
      const next = { ...prev };
      for (const dsId of affected) {
        if (next[dsId]) next[dsId] = { ...next[dsId], loading: true, data: null };
      }
      return next;
    });
    loadingRef.current.clear();
    scheduleDatasetLoads(affected);
  }, [document, scheduleDatasetLoads]);

  const loadDataset = useCallback((datasetId: string) => {
    if (loadingRef.current.has(datasetId)) return;
    loadingRef.current.add(datasetId);
    const myRevision = revisionRef.current;

    setDatasets((prev) => ({
      ...prev,
      [datasetId]: { loading: true, error: null, data: null, totalRows: 0 },
    }));

    if (!versionId) {
      // Preview mode without a persisted version: use locally computed data.
      const datasetDef = document.datasets?.find((d) => d.id === datasetId);
      if (!datasetDef) {
        setDatasets((prev) => ({
          ...prev,
          [datasetId]: { loading: false, error: 'Dataset not found in spec', data: null, totalRows: 0 },
        }));
        loadingRef.current.delete(datasetId);
        return;
      }
      setDatasets((prev) => ({
        ...prev,
        [datasetId]: { loading: false, error: null, data: [], totalRows: 0 },
      }));
      loadingRef.current.delete(datasetId);
      return;
    }

    reportService
      .fetchDataForReport(versionId, datasetId, parameters)
      .then((result) => {
        if (myRevision !== revisionRef.current) return; // stale
        setDatasets((prev) => ({
          ...prev,
          [datasetId]: { loading: false, error: null, data: result.rows, totalRows: result.totalRows },
        }));
      })
      .catch((err) => {
        if (myRevision !== revisionRef.current) return;
        setDatasets((prev) => ({
          ...prev,
          [datasetId]: { loading: false, error: err instanceof Error ? err.message : 'Failed to load data', data: null, totalRows: 0 },
        }));
      })
      .finally(() => {
        loadingRef.current.delete(datasetId);
      });
  }, [versionId, parameters, document.datasets]);

  loadDatasetRef.current = loadDataset;

  const updateSelection = useCallback((selectionId: string, _type: 'point' | 'interval', _fields: string[], value: unknown, _row: Record<string, unknown>) => {
    setSelections((prev) => ({ ...prev, [selectionId]: value }));
  }, []);

  const clearSelection = useCallback((selectionId: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[selectionId];
      return next;
    });
  }, []);

  // Execute an interaction's actions atomically: state mutations commit first,
  // then refresh actions reload affected datasets (each at most once).
  const triggerInteraction = useCallback((componentId: string, event: string, selectionId?: string, row?: Record<string, unknown>) => {
    const interactions = document.interactions ?? [];
    const matched = interactions.filter(
      (it: AirspecInteraction) => it.on.component === componentId && it.on.event === event && (selectionId ? it.on.selection === selectionId : true),
    );
    if (matched.length === 0) return;

    revisionRef.current += 1;
    const paramChanges: Record<string, unknown> = {};
    const clearedParams = new Set<string>();
    const datasetsToRefresh = new Set<string>();

    for (const it of matched) {
      const actions = (it.actions ?? (it.action ? [it.action] : [])) as AirspecAction[];
      for (const action of actions) {
        if (action.type === 'setParameter') {
          if (action.valueFrom && row) {
            const field = action.valueFrom.field;
            const mode = action.valueFrom.mode ?? 'scalar';
            if (mode === 'scalar') paramChanges[action.parameter] = row[field];
            else if (mode === 'values') paramChanges[action.parameter] = [row[field]];
            else if (mode === 'range') paramChanges[action.parameter] = { start: row[field], end: row[field] };
          } else {
            paramChanges[action.parameter] = action.value;
          }
        } else if (action.type === 'clearParameter') {
          clearedParams.add(action.parameter);
        } else if (action.type === 'refresh') {
          const ids = action.datasetIds ?? [];
          // If no datasetIds given, refresh all datasets affected by the param changes in this batch.
          if (ids.length > 0) ids.forEach((id) => datasetsToRefresh.add(id));
        }
      }
    }

    // Commit parameter state atomically.
    setParameters((prev) => {
      const next = { ...prev };
      for (const [id, val] of Object.entries(paramChanges)) next[id] = val;
      for (const id of clearedParams) delete next[id];
      return next;
    });

    // Determine refresh set: explicit refresh actions + datasets affected by param changes.
    for (const paramId of [...Object.keys(paramChanges), ...clearedParams]) {
      findAffectedDatasets(document, paramId).forEach((id) => datasetsToRefresh.add(id));
    }
    if (selectionId) {
      // selectionClear clears the selection state too.
      if (event === 'selectionClear') clearSelection(selectionId);
    }

    setDatasets((prev) => {
      const next = { ...prev };
      for (const dsId of datasetsToRefresh) {
        if (next[dsId]) next[dsId] = { ...next[dsId], loading: true, data: null };
      }
      return next;
    });
    loadingRef.current.clear();
    scheduleDatasetLoads([...datasetsToRefresh]);
  }, [document, scheduleDatasetLoads, clearSelection]);

  // Resolve a chart's graphic (literal or graphicBinding against current params).
  const resolveGraphic = useCallback((chart: AirspecChartComponent): GraphicResolution => {
    if (chart.graphic) return { graphic: chart.graphic, bindingError: null };
    if (chart.graphicBinding) {
      const result = resolveBinding(chart.graphicBinding, parameters);
      if (!result.matched) {
        const paramVal = parameters[chart.graphicBinding.parameter];
        return {
          graphic: result.value as AirspecGraphic,
          bindingError: `Parameter "${chart.graphicBinding.parameter}" has no matching case for value "${String(paramVal)}"`,
        };
      }
      return { graphic: result.value as AirspecGraphic, bindingError: null };
    }
    return { graphic: null, bindingError: null };
  }, [parameters]);

  const diagnoseEmpty = useCallback((datasetId: string) => {
    if (!versionId) {
      setDiagnosis({ open: true, loading: false, analysis: null, error: 'Diagnosis is only available for saved reports.' });
      return;
    }
    setDiagnosis({ open: true, loading: true, analysis: null, error: null });
    reportService
      .diagnoseEmptyDataset(versionId, datasetId, parameters)
      .then((analysis) => {
        setDiagnosis({ open: true, loading: false, analysis, error: null });
      })
      .catch((err) => {
        setDiagnosis({ open: true, loading: false, analysis: null, error: err instanceof Error ? err.message : 'Diagnosis failed' });
      });
  }, [versionId, parameters]);

  const value = useMemo<ReportContextValue>(() => ({
    document,
    parameters,
    datasets,
    versionId,
    selections,
    setParameter,
    clearParameter,
    loadDataset,
    updateSelection,
    clearSelection,
    triggerInteraction,
    resolveGraphic,
    diagnoseEmpty,
  }), [document, parameters, datasets, versionId, selections, setParameter, clearParameter, loadDataset, updateSelection, clearSelection, triggerInteraction, resolveGraphic, diagnoseEmpty]);

  return (
    <ReportContext.Provider value={value}>
      {children}
      <DiagnosisModal
        open={diagnosis.open}
        loading={diagnosis.loading}
        analysis={diagnosis.analysis}
        error={diagnosis.error}
        onClose={() => setDiagnosis((prev) => ({ ...prev, open: false }))}
      />
    </ReportContext.Provider>
  );
}

// Find datasets affected by a parameter change. A dataset is affected if the
// parameter is referenced by any filter (literal or via a bindings.filters
// case/default, recursing through filter groups) or by any dataset binding.
function findAffectedDatasets(document: AirspecDocument, parameterId: string): string[] {
  const affected = new Set<string>();
  for (const ds of document.datasets ?? []) {
    if (filtersReferenceParameter(ds.filters, parameterId)) {
      affected.add(ds.id);
      continue;
    }
    if (ds.bindings) {
      if (ds.bindings.filters && bindingReferencesParameter(ds.bindings.filters, parameterId)) {
        affected.add(ds.id);
        continue;
      }
      for (const [key, binding] of Object.entries(ds.bindings)) {
        if (key === 'filters') continue;
        if (binding && (binding as AirspecBinding<unknown>).parameter === parameterId) {
          affected.add(ds.id);
          break;
        }
      }
    }
  }
  return [...affected];
}

// Does any filter in this list (recursing filter groups) reference parameterId?
function filtersReferenceParameter(filters: AirspecFilter[] | undefined, parameterId: string): boolean {
  if (!filters) return false;
  for (const f of filters) {
    if ('boolean' in f && 'filters' in f) {
      if (filtersReferenceParameter(f.filters, parameterId)) return true;
    } else if ('parameter' in f && f.parameter === parameterId) {
      return true;
    }
  }
  return false;
}

// Does a filters binding reference parameterId in its own parameter, or in any
// case/default filter (recursing groups)?
function bindingReferencesParameter(binding: AirspecBinding<AirspecFilter[]>, parameterId: string): boolean {
  if (binding.parameter === parameterId) return true;
  const allCases = [...binding.cases.map((c) => c.value), binding.default];
  for (const caseFilters of allCases) {
    if (filtersReferenceParameter(caseFilters, parameterId)) return true;
  }
  return false;
}

export interface BindingResult<T> {
  matched: boolean;
  value: T;
}

// Type-aware case matching: coerces the parameter value to match the declared
// case value's type. HTML <select> elements return strings, so a numeric case
// value (equals: 3) would never match a string param value ("3") under strict
// ===. This coercion is the safety net that prevents frozen dropdowns.
export function caseMatches(equals: string | number | boolean, paramValue: unknown): boolean {
  if (typeof equals === 'number') {
    const n = Number(paramValue);
    return !isNaN(n) && n === equals;
  }
  if (typeof equals === 'boolean') {
    return Boolean(paramValue) === equals;
  }
  return String(paramValue) === String(equals);
}

export function resolveBinding<T>(binding: AirspecBinding<T>, parameters: Record<string, unknown>): BindingResult<T> {
  const paramValue = parameters[binding.parameter];
  const match = binding.cases.find((c) => caseMatches(c.equals, paramValue));
  if (match) return { matched: true, value: match.value };
  return { matched: false, value: binding.default };
}

// Re-exported for LayoutWalker to evaluate visibleWhen (single object in 1.1).
export function evaluateVisibleWhen(
  visibleWhen: { parameter: string; operator: string; value?: unknown } | undefined,
  parameters: Record<string, unknown>,
): boolean {
  if (!visibleWhen) return true;
  const paramValue = parameters[visibleWhen.parameter];
  const target = visibleWhen.value;
  switch (visibleWhen.operator) {
    case 'equals': return paramValue === target;
    case 'notEquals': return paramValue !== target;
    case 'in': return Array.isArray(target) && target.includes(paramValue);
    case 'notIn': return Array.isArray(target) && !target.includes(paramValue);
    case 'isNull': return paramValue === null || paramValue === undefined;
    case 'isNotNull': return paramValue !== null && paramValue !== undefined;
    case 'isTrue': return paramValue === true;
    case 'isFalse': return paramValue === false;
    case 'contains': return String(paramValue ?? '').includes(String(target));
    case 'startsWith': return String(paramValue ?? '').startsWith(String(target));
    case 'endsWith': return String(paramValue ?? '').endsWith(String(target));
    case 'greaterThan': return Number(paramValue) > Number(target);
    case 'greaterThanOrEqual': return Number(paramValue) >= Number(target);
    case 'lessThan': return Number(paramValue) < Number(target);
    case 'lessThanOrEqual': return Number(paramValue) <= Number(target);
    default: return true;
  }
}

// Resolve a dataset's bindings to a concrete dataset (used for preview + type helpers).
export function resolveDatasetForPreview(ds: AirspecDataset, parameters: Record<string, unknown>): AirspecDataset {
  if (!ds.bindings) return ds;
  const out: AirspecDataset = { ...ds };
  const b = ds.bindings;
  if (b.fields) out.fields = resolveBinding(b.fields, parameters).value;
  if (b.field) out.field = resolveBinding(b.field, parameters).value;
  if (b.dimensions) out.dimensions = resolveBinding(b.dimensions, parameters).value;
  if (b.metrics) out.metrics = resolveBinding(b.metrics, parameters).value;
  if (b.filters) out.filters = resolveBinding(b.filters, parameters).value as AirspecFilter[];
  if (b.sort) out.sort = resolveBinding(b.sort, parameters).value;
  if (b.limit) out.limit = resolveBinding(b.limit, parameters).value;
  delete out.bindings;
  return out;
}

export type { AirspecComponent };
