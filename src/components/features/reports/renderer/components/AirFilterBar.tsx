import { useEffect, useMemo, useRef } from 'react';
import type { AirComponentProps } from '../componentRegistry';
import { useReportContext } from '../ReportContext';
import type {
  AirspecParameter,
  AirspecFilterBarComponent,
} from '../../../../../types/airspec';

const RELATIVE_DATE_LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  last90Days: 'Last 90 days',
  last365Days: 'Last 365 days',
  weekToDate: 'Week to date',
  monthToDate: 'Month to date',
  quarterToDate: 'Quarter to date',
  yearToDate: 'Year to date',
  previousWeek: 'Previous week',
  previousMonth: 'Previous month',
  previousQuarter: 'Previous quarter',
  previousYear: 'Previous year',
};

// Coerce a raw DOM string (from <select>.value) to the parameter's declared
// type, inferred from its default value. fieldValues-option selects have no
// client-side option values, so the DOM returns a string; if the parameter's
// default is a number, coerce to number so graphicBinding case matching works.
function coerceDomValue(raw: string, param: AirspecParameter): unknown {
  if (typeof param.default === 'number') {
    const n = Number(raw);
    return isNaN(n) ? raw : n;
  }
  if (typeof param.default === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }
  return raw;
}

export default function AirFilterBar({ component }: AirComponentProps) {
  const { document, parameters, datasets, loadDataset, setParameter, clearParameter } = useReportContext();
  const c = component as unknown as AirspecFilterBarComponent;
  const paramIds = c.parameters ?? [];

  const params = (document.parameters ?? []).filter((p: AirspecParameter) => paramIds.includes(p.id));

  // For fieldValues parameters, find datasets that share the same source and
  // trigger their load if not already loaded.
  const fieldValuesSourceDatasets = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const param of params) {
      if (param.options?.type === 'fieldValues') {
        const source = param.options.source;
        const matchingDatasetIds = (document.datasets ?? [])
          .filter((ds) => ds.source === source)
          .map((ds) => ds.id);
        map.set(param.id, matchingDatasetIds);
      }
    }
    return map;
  }, [params, document.datasets]);

  // Trigger loads for fieldValues source datasets.
  useEffect(() => {
    for (const dsIds of fieldValuesSourceDatasets.values()) {
      for (const dsId of dsIds) {
        if (!datasets[dsId]) loadDataset(dsId);
      }
    }
  }, [fieldValuesSourceDatasets, datasets, loadDataset]);

  // Resolve fieldValues options from loaded dataset rows.
  // Cache options per-parameter so they don't disappear when datasets reload
  // with a filter applied (which would narrow options to just the selected value).
  const cachedOptionsRef = useRef<Map<string, { value: string | number | boolean; label: string }[]>>(new Map());

  const resolvedFieldOptions = useMemo(() => {
    const map = new Map<string, { value: string | number | boolean; label: string }[]>();
    for (const param of params) {
      if (param.options?.type !== 'fieldValues') continue;
      const field = param.options.field;
      const dsIds = fieldValuesSourceDatasets.get(param.id) ?? [];
      const seen = new Set<string | number | boolean>();
      const options: { value: string | number | boolean; label: string }[] = [];
      for (const dsId of dsIds) {
        const ds = datasets[dsId];
        if (!ds?.data) continue;
        for (const row of ds.data) {
          const val = row[field];
          if (val == null) continue;
          const coerced = typeof val === 'number' || typeof val === 'boolean' ? val : String(val);
          if (!seen.has(coerced)) {
            seen.add(coerced);
            options.push({ value: coerced, label: String(coerced) });
          }
        }
      }
      if (options.length > 0) {
        options.sort((a, b) => String(a.label).localeCompare(String(b.label)));
        cachedOptionsRef.current.set(param.id, options);
        map.set(param.id, options);
      } else {
        // Use cached options if current dataset is empty/loading/filtered
        const cached = cachedOptionsRef.current.get(param.id);
        if (cached) map.set(param.id, cached);
      }
    }
    return map;
  }, [params, fieldValuesSourceDatasets, datasets]);

  if (params.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
      {params.map((param) => {
        const value = parameters[param.id];
        if (param.hidden) return null;

        return (
          <div key={param.id} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">{param.label}</label>
            {renderControl(param, value, setParameter, clearParameter, resolvedFieldOptions.get(param.id))}
          </div>
        );
      })}
    </div>
  );
}

function renderControl(
  param: AirspecParameter,
  value: unknown,
  setParameter: (id: string, value: unknown) => void,
  clearParameter: (id: string) => void,
  fieldValuesOptions?: { value: string | number | boolean; label: string }[],
) {
  const baseClass = 'px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  if (param.type === 'select' || param.type === 'multiSelect') {
    const isMulti = param.type === 'multiSelect';
    const options = param.options?.type === 'static'
      ? param.options.values
      : (fieldValuesOptions ?? []);
    return (
      <select
        value={value != null ? (isMulti ? String((value as unknown[])[0] ?? '') : String(value)) : '__all__'}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '__all__') {
            clearParameter(param.id);
          } else {
            const opt = options.find((o) => String(o.value) === raw);
            const resolved = opt ? opt.value : coerceDomValue(raw, param);
            setParameter(param.id, isMulti ? [resolved] : resolved);
          }
        }}
        className={baseClass + ' min-w-[140px]'}
      >
        <option value="__all__">All</option>
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (param.type === 'text') {
    return (
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => setParameter(param.id, e.target.value)}
        className={baseClass}
        placeholder={param.label}
      />
    );
  }

  if (param.type === 'number') {
    return (
      <input
        type="number"
        value={value != null ? String(value) : ''}
        onChange={(e) => setParameter(param.id, e.target.value ? Number(e.target.value) : null)}
        className={baseClass + ' w-32'}
      />
    );
  }

  if (param.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => setParameter(param.id, e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
    );
  }

  if (param.type === 'date') {
    return (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={(e) => setParameter(param.id, e.target.value)}
        className={baseClass}
      />
    );
  }

  if (param.type === 'dateRange') {
    const relative = (value as { relative?: string })?.relative;
    return (
      <select
        value={relative ?? 'last30Days'}
        onChange={(e) => setParameter(param.id, { relative: e.target.value })}
        className={baseClass}
      >
        {Object.entries(RELATIVE_DATE_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    );
  }

  return null;
}
