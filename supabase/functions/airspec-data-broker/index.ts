import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { versionId, datasetId, parameters } = await req.json();

    if (!versionId || !datasetId) {
      return new Response(
        JSON.stringify({ error: "versionId and datasetId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: version, error: versionErr } = await supabase
      .from("airspec_report_versions")
      .select("report_spec_json")
      .eq("id", versionId)
      .maybeSingle();

    if (versionErr || !version) {
      return new Response(
        JSON.stringify({ error: "Report version not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const spec = version.report_spec_json as { datasets?: DatasetDef[]; parameters?: ParameterDef[] };
    const datasets = spec?.datasets ?? [];
    const datasetDef = datasets.find((d) => d.id === datasetId);

    if (!datasetDef) {
      return new Response(
        JSON.stringify({ error: `Dataset "${datasetId}" not found in spec` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const params = (parameters ?? {}) as Record<string, unknown>;
    const specParameters = spec?.parameters ?? [];

    // Resolve the dataset against current parameter state (bindings -> concrete values).
    const resolved = resolveDataset(datasetDef, params, specParameters, supabase);

    // Fetch source rows.
    const sourceRows = await fetchSourceRows(supabase, resolved.source);
    let rows: Record<string, unknown>[] = sourceRows;

    // Apply filters.
    if (resolved.filters && resolved.filters.length > 0) {
      rows = applyFilters(rows, resolved.filters, params);
    }

    let resultRows: Record<string, unknown>[];
    let totalRows: number;

    switch (resolved.operation) {
      case "aggregate":
        resultRows = executeAggregate(rows, resolved);
        totalRows = resultRows.length;
        break;
      case "distinct":
        resultRows = executeDistinct(rows, resolved);
        totalRows = resultRows.length;
        break;
      default: {
        // list
        if (resolved.sort && resolved.sort.length > 0) {
          rows = applySort(rows, resolved.sort);
        }
        if (resolved.fields && resolved.fields.length > 0) {
          rows = rows.map((row) => pickFields(row, resolved.fields!));
        }
        totalRows = rows.length;
        const limit = resolved.limit ?? 1000;
        resultRows = rows.slice(0, limit);
        break;
      }
    }

    const truncated = resultRows.length < totalRows;

    return new Response(
      JSON.stringify({ rows: resultRows, totalRows, truncated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

interface ParameterDef {
  id: string;
  type: string;
  options?: { type: "static" | "fieldValues"; values?: { value: unknown; label: string }[]; source?: string; field?: string };
  default?: unknown;
}

interface Dimension { field: string; timeUnit?: string; alias?: string }
interface Metric { operation: string; field?: string; alias?: string }
interface Sort { field: string; direction: "ascending" | "descending" }
interface Filter { field?: string; operator?: string; value?: unknown; parameter?: string; boolean?: string; filters?: Filter[] }
interface Binding<T> { parameter: string; cases: { equals: unknown; value: T }[]; default: T }
interface DatasetBindings {
  fields?: Binding<string[]>; field?: Binding<string>; dimensions?: Binding<Dimension[]>;
  metrics?: Binding<Metric[]>; filters?: Binding<Filter[]>; sort?: Binding<Sort[]>; limit?: Binding<number>;
}
interface DatasetDef {
  id: string;
  source: string;
  operation: "list" | "aggregate" | "distinct";
  fields?: string[];
  field?: string;
  dimensions?: Dimension[];
  metrics?: Metric[];
  filters?: Filter[];
  sort?: Sort[];
  limit?: number;
  bindings?: DatasetBindings;
}

interface ResolvedDataset {
  id: string;
  source: string;
  operation: "list" | "aggregate" | "distinct";
  fields?: string[];
  field?: string;
  dimensions?: Dimension[];
  metrics?: Metric[];
  filters?: Filter[];
  sort?: Sort[];
  limit?: number;
}

// Resolve all bindings for a dataset against the current parameter state.
// A binding replaces its target property with the value of the matching case
// (or `default`). A dataset never declares both a literal property and a
// binding for the same property (validated upstream).
function resolveDataset(
  def: DatasetDef,
  params: Record<string, unknown>,
  parameters: ParameterDef[],
  _supabase: ReturnType<typeof createClient>,
): ResolvedDataset {
  const out: ResolvedDataset = {
    id: def.id,
    source: def.source,
    operation: def.operation,
    fields: def.fields,
    field: def.field,
    dimensions: def.dimensions,
    metrics: def.metrics,
    filters: def.filters,
    sort: def.sort,
    limit: def.limit,
  };

  const b = def.bindings;
  if (!b) return out;

  const resolve = <T>(binding: Binding<T> | undefined, literal: T | undefined): T | undefined => {
    if (!binding) return literal;
    const paramValue = params[binding.parameter];
    const match = binding.cases.find((c) => c.equals === paramValue);
    return match ? match.value : binding.default;
  };

  out.fields = resolve(b.fields, def.fields);
  out.field = resolve(b.field, def.field);
  out.dimensions = resolve(b.dimensions, def.dimensions);
  out.metrics = resolve(b.metrics, def.metrics);
  out.filters = resolve(b.filters, def.filters);
  out.sort = resolve(b.sort, def.sort);
  if (b.limit) {
    const v = resolve(b.limit, def.limit);
    out.limit = v;
  }

  // fieldValues-sourced parameter options are resolved client-side; the broker
  // only needs the literal parameter value from `params` for filter.parameter.
  void parameters;
  return out;
}

async function fetchSourceRows(
  supabase: ReturnType<typeof createClient>,
  sourceRef: string,
): Promise<Record<string, unknown>[]> {
  // Source references in AIRspec 1.1 are spec-compliant slugs, not UUIDs.
  const { data: sourceRow, error: sourceErr } = await supabase
    .from("airspec_data_sources")
    .select("id, source_type, api_url, api_format, api_root_path")
    .eq("slug", sourceRef)
    .maybeSingle();

  if (sourceErr || !sourceRow) throw new Error(`Data source "${sourceRef}" not found`);

  // Dynamic API sources fetch live at render time; rows are never persisted.
  if (sourceRow.source_type === "api") {
    return fetchLiveApiRows(sourceRow.api_url, sourceRow.api_format, sourceRow.api_root_path);
  }

  const { data: rawRows, error: rowsErr } = await supabase
    .from("airspec_dataset_rows")
    .select("row_data")
    .eq("data_source_id", sourceRow.id)
    .limit(10000);

  if (rowsErr) throw new Error(rowsErr.message);

  return (rawRows ?? []).map(
    (r: { row_data: Record<string, unknown> }) => r.row_data,
  );
}

const MAX_API_ROWS = 10000;

async function fetchLiveApiRows(
  apiUrl: string | null,
  apiFormat: string | null,
  apiRootPath: string | null,
): Promise<Record<string, unknown>[]> {
  if (!apiUrl) throw new Error("API data source has no url configured");

  let response: Response;
  try {
    response = await fetch(apiUrl, { method: "GET" });
  } catch (err) {
    throw new Error(`Remote fetch failed: ${(err as Error).message}`);
  }
  if (!response.ok) throw new Error(`Remote endpoint returned ${response.status}`);

  const text = await response.text();
  let format: "json" | "csv" = (apiFormat as "json" | "csv") ?? "json";
  if (!apiFormat) {
    const ct = (response.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("text/csv") || (!ct.includes("json") && !text.trim().startsWith("{") && !text.trim().startsWith("["))) {
      format = "csv";
    }
  }

  let rows: Record<string, unknown>[];
  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Remote response is not valid JSON: ${(err as Error).message}`);
    }
    rows = extractArray(parsed, apiRootPath ?? undefined);
  } else {
    rows = parseCsv(text);
  }

  if (rows.length > MAX_API_ROWS) rows = rows.slice(0, MAX_API_ROWS);
  return rows;
}

function extractArray(parsed: unknown, rootPath?: string | null): Record<string, unknown>[] {
  if (rootPath) {
    const arr = walkPath(parsed, rootPath);
    if (Array.isArray(arr)) return coerceRows(arr);
    return [];
  }
  if (Array.isArray(parsed)) return coerceRows(parsed);
  const found = findFirstObjectArray(parsed, []);
  if (found) return coerceRows(found.arr);
  if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  return [];
}

function walkPath(value: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = value;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function findFirstObjectArray(value: unknown, path: string[]): { arr: unknown[]; path: string[] } | null {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.some((v) => v && typeof v === "object" && !Array.isArray(v))) {
      return { arr: value, path };
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const found = findFirstObjectArray(val, [...path, key]);
      if (found) return found;
    }
  }
  return null;
}

function coerceRows(arr: unknown[]): Record<string, unknown>[] {
  return arr.filter((v) => v && typeof v === "object" && !Array.isArray(v)) as Record<string, unknown>[];
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function pickFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in row) {
      picked[f] = row[f];
    } else if (f.includes('.')) {
      const parts = f.split('.');
      let cur: unknown = row;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && !Array.isArray(cur) && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          cur = undefined;
          break;
        }
      }
      picked[f] = cur;
    } else {
      picked[f] = row[f];
    }
  }
  return picked;
}

// AIRspec 1.1 filter operators.
function applyFilters(
  rows: Record<string, unknown>[],
  filters: Filter[],
  parameters: Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.filter((row) => matchFilterGroup(row, filters, parameters, "and"));
}

function matchFilterGroup(
  row: Record<string, unknown>,
  filters: Filter[],
  parameters: Record<string, unknown>,
  boolean: string,
): boolean {
  if (boolean === "or") {
    return filters.some((f) => matchSingleFilter(row, f, parameters));
  }
  return filters.every((f) => matchSingleFilter(row, f, parameters));
}

function matchSingleFilter(row: Record<string, unknown>, filter: Filter, parameters: Record<string, unknown>): boolean {
  // filter group
  if (filter.boolean && filter.filters) {
    return matchFilterGroup(row, filter.filters, parameters, filter.boolean);
  }

  const field = filter.field as string;
  let value = filter.value;
  if (filter.parameter) {
    value = parameters[filter.parameter];
  }

  // Skip when value is null/undefined or "__all__" sentinel.
  if (value === null || value === undefined || value === "__all__") return true;

  const fieldVal = row[field];
  if (!(field in row)) return true;

  switch (filter.operator) {
    case "equals": return fieldVal === value;
    case "notEquals": return fieldVal !== value;
    case "in": return Array.isArray(value) && value.includes(fieldVal);
    case "notIn": return Array.isArray(value) && !value.includes(fieldVal);
    case "contains": return String(fieldVal ?? "").toLowerCase().includes(String(value).toLowerCase());
    case "startsWith": return String(fieldVal ?? "").toLowerCase().startsWith(String(value).toLowerCase());
    case "endsWith": return String(fieldVal ?? "").toLowerCase().endsWith(String(value).toLowerCase());
    case "greaterThan": return Number(fieldVal) > Number(value);
    case "greaterThanOrEqual": return Number(fieldVal) >= Number(value);
    case "lessThan": return Number(fieldVal) < Number(value);
    case "lessThanOrEqual": return Number(fieldVal) <= Number(value);
    case "between": {
      const num = Number(fieldVal);
      const arr = value as [number, number];
      return Array.isArray(arr) && num >= Number(arr[0]) && num <= Number(arr[1]);
    }
    case "isNull": return fieldVal === null || fieldVal === undefined;
    case "isNotNull": return fieldVal !== null && fieldVal !== undefined;
    case "isTrue": return fieldVal === true || fieldVal === 1 || fieldVal === "true";
    case "isFalse": return fieldVal === false || fieldVal === 0 || fieldVal === "false";
    default: return true;
  }
}

function executeAggregate(rows: Record<string, unknown>[], def: ResolvedDataset): Record<string, unknown>[] {
  const dimensions = def.dimensions ?? [];
  const metrics = def.metrics ?? [];

  // No dimensions -> single aggregate row.
  if (dimensions.length === 0) {
    const result: Record<string, unknown> = {};
    for (const m of metrics) {
      const alias = m.alias ?? defaultMetricAlias(m);
      result[alias] = computeMetric(rows, m);
    }
    return [result];
  }

  // Group by dimension fields (after applying timeUnit transforms).
  const preparedRows = rows.map((row) => applyDimensions(row, dimensions));

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of preparedRows) {
    const key = dimensions.map((d) => String(row[d.alias ?? d.field] ?? "")).join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const results: Record<string, unknown>[] = [];
  for (const [, groupRows] of groups) {
    const result: Record<string, unknown> = {};
    for (const d of dimensions) {
      const alias = d.alias ?? d.field;
      result[alias] = groupRows[0][alias];
    }
    for (const m of metrics) {
      const alias = m.alias ?? defaultMetricAlias(m);
      result[alias] = computeMetric(groupRows, m);
    }
    results.push(result);
  }

  if (def.sort && def.sort.length > 0) {
    return applySort(results, def.sort);
  }
  return results;
}

function applyDimensions(row: Record<string, unknown>, dimensions: Dimension[]): Record<string, unknown> {
  const out = { ...row };
  for (const d of dimensions) {
    const alias = d.alias ?? d.field;
    if (!d.timeUnit) {
      if (alias !== d.field) out[alias] = row[d.field];
      continue;
    }
    const raw = row[d.field];
    if (raw === null || raw === undefined) { out[alias] = null; continue; }
    const date = new Date(raw as string);
    if (isNaN(date.getTime())) { out[alias] = raw; continue; }
    switch (d.timeUnit) {
      case "day": out[alias] = date.toISOString().slice(0, 10); break;
      case "week": {
        const onejan = new Date(date.getFullYear(), 0, 1);
        const week = Math.ceil(((date.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
        out[alias] = `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
        break;
      }
      case "month": out[alias] = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; break;
      case "quarter": out[alias] = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`; break;
      case "year": out[alias] = String(date.getFullYear()); break;
      default: out[alias] = raw;
    }
  }
  return out;
}

function defaultMetricAlias(m: Metric): string {
  return m.operation === "count" ? "count" : `${m.operation}_${m.field}`;
}

function computeMetric(rows: Record<string, unknown>[], m: Metric): number {
  switch (m.operation) {
    case "count": return rows.length;
    case "countDistinct": {
      const seen = new Set<unknown>();
      for (const r of rows) seen.add(r[m.field as string]);
      return seen.size;
    }
    case "sum": {
      return rows.reduce((acc, r) => acc + (Number(r[m.field as string]) || 0), 0);
    }
    case "average": {
      const nums = rows.map((r) => Number(r[m.field as string])).filter((v) => !isNaN(v));
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    }
    case "minimum": {
      const nums = rows.map((r) => Number(r[m.field as string])).filter((v) => !isNaN(v));
      return nums.length > 0 ? Math.min(...nums) : 0;
    }
    case "maximum": {
      const nums = rows.map((r) => Number(r[m.field as string])).filter((v) => !isNaN(v));
      return nums.length > 0 ? Math.max(...nums) : 0;
    }
    case "median": {
      const nums = rows.map((r) => Number(r[m.field as string])).filter((v) => !isNaN(v)).sort((a, b) => a - b);
      if (nums.length === 0) return 0;
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
    }
    default: return 0;
  }
}

function executeDistinct(rows: Record<string, unknown>[], def: ResolvedDataset): Record<string, unknown>[] {
  const field = def.field;
  if (!field) return rows;

  const seen = new Set<unknown>();
  const results: Record<string, unknown>[] = [];
  for (const row of rows) {
    const key = row[field];
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ [field]: key });
    }
  }
  return results;
}

function applySort(rows: Record<string, unknown>[], sort: Sort[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    for (const { field, direction } of sort) {
      const aVal = a[field];
      const bVal = b[field];
      const mult = direction === "descending" ? -1 : 1;

      if (aVal == null && bVal == null) continue;
      if (aVal == null) return mult;
      if (bVal == null) return -mult;

      if (typeof aVal === "number" && typeof bVal === "number") {
        if (aVal !== bVal) return (aVal - bVal) * mult;
      } else {
        const cmp = String(aVal).localeCompare(String(bVal));
        if (cmp !== 0) return cmp * mult;
      }
    }
    return 0;
  });
}
