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
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load the version spec
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

    const spec = version.report_spec_json as {
      datasets?: DatasetDef[];
      parameters?: ParameterDef[];
    };
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

    // Resolve bindings to get the concrete dataset definition
    const resolved = resolveDataset(datasetDef, params);

    // Fetch source rows
    const sourceRows = await fetchSourceRows(supabase, resolved.source);

    // Apply derived fields
    let rows = sourceRows;
    if (resolved.derived && resolved.derived.length > 0) {
      rows = applyDerived(rows, resolved.derived);
    }

    // Apply filters to see what survives
    let filteredRows = rows;
    if (resolved.filters && resolved.filters.length > 0) {
      filteredRows = applyFilters(rows, resolved.filters, params);
    }

    // Gather distinct values for fields referenced in filters
    const filterFields = extractFilterFields(resolved.filters ?? []);
    const fieldDistinctValues: Record<string, unknown[]> = {};
    for (const field of filterFields) {
      const values = new Set<unknown>();
      for (const row of rows) {
        if (field in row) values.add(row[field]);
      }
      fieldDistinctValues[field] = [...values].slice(0, 50);
    }

    // Gather source schema
    const sourceFields = sourceRows.length > 0
      ? Object.keys(sourceRows[0])
      : [];

    // Build the analysis context for Claude
    const resolvedFiltersJson = JSON.stringify(resolved.filters ?? [], null, 2);
    const sampleRows = sourceRows.slice(0, 5);
    const paramValues = specParameters.map((p) => ({
      id: p.id,
      type: p.type,
      currentValue: params[p.id] ?? p.default ?? null,
    }));

    const systemPrompt = `You are a debugging assistant for the AIRspec reporting system. A report dataset has returned zero rows. Your job is to analyze the dataset definition, filters, parameter values, and actual source data to find why, then suggest a concise correction to the user's next chat prompt.

Common causes:
- Filter value case mismatch (e.g. filter says "Male" but data has "male")
- Filter value type mismatch (e.g. filter says "3" but data has 3)
- Filter value that doesn't exist in the data at all
- Parameter resolving to null/undefined so the filter is skipped
- Field name in the filter that doesn't exist in the source data
- A binding resolving to the wrong case/default

Respond in 2-3 sentences max. Be direct. Identify the specific mismatch and tell the user exactly what to change in their next prompt to fix it. Do not explain the AIRspec system or apologize. Just state the problem and the fix.`;

    const userMessage = `DATASET DEFINITION:
${JSON.stringify({ ...resolved, filters: resolved.filters }, null, 2)}

CURRENT PARAMETER VALUES:
${JSON.stringify(paramValues, null, 2)}

RESOLVED FILTERS (after binding resolution):
${resolvedFiltersJson}

SOURCE DATA SCHEMA (field names in the actual data):
${JSON.stringify(sourceFields)}

DISTINCT VALUES FOR FILTERED FIELDS (sample up to 50):
${JSON.stringify(fieldDistinctValues, null, 2)}

SAMPLE SOURCE ROWS (first 5):
${JSON.stringify(sampleRows, null, 2)}

RESULT: ${filteredRows.length} rows after filtering (out of ${rows.length} source rows).

Why is this returning no data? What should the user change in their next prompt to fix it?`;

    const analysis = await callAnthropic(anthropicKey, "claude-fable-5", systemPrompt, userMessage);

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[airspec-diagnose-empty] Error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers (mirrors airspec-data-broker logic)
// ---------------------------------------------------------------------------

interface ParameterDef {
  id: string;
  type: string;
  default?: unknown;
}
interface Dimension { field: string; timeUnit?: string; alias?: string }
interface Metric { operation?: string; field?: string; alias?: string; calc?: DerivedExpr }
interface Sort { field: string; direction: "ascending" | "descending" }
interface Filter { field?: string; operator?: string; value?: unknown; parameter?: string; boolean?: string; filters?: Filter[] }
interface Binding<T> { parameter: string; cases: { equals: unknown; value: T }[]; default: T }
interface DatasetBindings {
  fields?: Binding<string[]>; field?: Binding<string>; dimensions?: Binding<Dimension[]>;
  metrics?: Binding<Metric[]>; filters?: Binding<Filter[]>; sort?: Binding<Sort[]>; limit?: Binding<number>;
}
type DerivedExprOperand = string | number | DerivedExpr;
interface DerivedExpr {
  add?: DerivedExprOperand[]; subtract?: DerivedExprOperand[];
  multiply?: DerivedExprOperand[]; divide?: [DerivedExprOperand, DerivedExprOperand];
}
interface DerivedField { alias: string; expr: DerivedExpr }
interface DatasetDef {
  id: string; source: string; operation: string; derived?: DerivedField[];
  fields?: string[]; field?: string; dimensions?: Dimension[]; metrics?: Metric[];
  filters?: Filter[]; sort?: Sort[]; limit?: number; bindings?: DatasetBindings;
}
interface ResolvedDataset {
  id: string; source: string; operation: string; derived?: DerivedField[];
  fields?: string[]; field?: string; dimensions?: Dimension[]; metrics?: Metric[];
  filters?: Filter[]; sort?: Sort[]; limit?: number;
}

function resolveDataset(def: DatasetDef, params: Record<string, unknown>): ResolvedDataset {
  const out: ResolvedDataset = {
    id: def.id, source: def.source, operation: def.operation,
    derived: def.derived, fields: def.fields, field: def.field,
    dimensions: def.dimensions, metrics: def.metrics, filters: def.filters,
    sort: def.sort, limit: def.limit,
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
  if (b.limit) out.limit = resolve(b.limit, def.limit);
  return out;
}

async function fetchSourceRows(
  supabase: ReturnType<typeof createClient>,
  sourceRef: string,
): Promise<Record<string, unknown>[]> {
  const { data: sourceRow, error: sourceErr } = await supabase
    .from("airspec_data_sources")
    .select("id, source_type, api_url, api_format, api_root_path, fields_json")
    .eq("slug", sourceRef)
    .maybeSingle();

  if (sourceErr || !sourceRow) throw new Error(`Data source "${sourceRef}" not found`);

  const fieldsJson = (sourceRow.fields_json ?? []) as { name: string; key?: string; type: string }[];

  if (sourceRow.source_type === "api") {
    const rawRows = await fetchLiveApiRows(sourceRow.api_url, sourceRow.api_format, sourceRow.api_root_path);
    if (fieldsJson.length > 0 && fieldsJson.some((f) => f.key && f.key !== f.name)) {
      return rawRows.map((row) => {
        const mapped: Record<string, unknown> = {};
        for (const f of fieldsJson) {
          const k = f.key || f.name;
          if (f.name in row) mapped[k] = row[f.name];
        }
        return mapped;
      });
    }
    return rawRows;
  }

  const { data: rawRows, error: rowsErr } = await supabase
    .from("airspec_dataset_rows")
    .select("row_data")
    .eq("data_source_id", sourceRow.id)
    .limit(10000);

  if (rowsErr) throw new Error(rowsErr.message);
  return (rawRows ?? []).map((r: { row_data: Record<string, unknown> }) => r.row_data);
}

const MAX_API_ROWS = 10000;

async function fetchLiveApiRows(
  apiUrl: string | null, apiFormat: string | null, apiRootPath: string | null,
): Promise<Record<string, unknown>[]> {
  if (!apiUrl) throw new Error("API data source has no url configured");
  const response = await fetch(apiUrl, { method: "GET" });
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
    const parsed = JSON.parse(text);
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
    } else return undefined;
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

function extractFilterFields(filters: Filter[]): string[] {
  const fields = new Set<string>();
  function walk(list: Filter[]) {
    for (const f of list) {
      if (f.boolean && f.filters) {
        walk(f.filters);
      } else if (f.field) {
        fields.add(f.field);
      }
    }
  }
  walk(filters);
  return [...fields];
}

function applyDerived(rows: Record<string, unknown>[], derived: DerivedField[] | undefined): Record<string, unknown>[] {
  if (!derived || derived.length === 0) return rows;
  return rows.map((row) => {
    const extended = { ...row };
    for (const d of derived) extended[d.alias] = evaluateDerivedExpr(d.expr, extended);
    return extended;
  });
}

function evaluateDerivedExpr(expr: DerivedExpr, row: Record<string, unknown>): number | null {
  const resolveOperand = (op: DerivedExprOperand): number | null => {
    if (typeof op === "number") return Number.isFinite(op) ? op : null;
    if (typeof op === "string") {
      const v = row[op];
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof op === "object" && op !== null) return evaluateDerivedExpr(op, row);
    return null;
  };
  const evalOp = (operands: DerivedExprOperand[] | undefined, fn: (a: number, b: number) => number): number | null => {
    if (!operands || operands.length < 2) return null;
    let result = resolveOperand(operands[0]);
    if (result === null) return null;
    for (let i = 1; i < operands.length; i++) {
      const val = resolveOperand(operands[i]);
      if (val === null) return null;
      result = fn(result, val);
      if (!Number.isFinite(result)) return null;
    }
    return result;
  };
  if (expr.add) return evalOp(expr.add, (a, b) => a + b);
  if (expr.subtract) return evalOp(expr.subtract, (a, b) => a - b);
  if (expr.multiply) return evalOp(expr.multiply, (a, b) => a * b);
  if (expr.divide) {
    if (!expr.divide || expr.divide.length !== 2) return null;
    const num = resolveOperand(expr.divide[0]);
    const den = resolveOperand(expr.divide[1]);
    if (num === null || den === null || den === 0) return null;
    const result = num / den;
    return Number.isFinite(result) ? result : null;
  }
  return null;
}

function applyFilters(rows: Record<string, unknown>[], filters: Filter[], parameters: Record<string, unknown>): Record<string, unknown>[] {
  return rows.filter((row) => matchFilterGroup(row, filters, parameters, "and"));
}

function matchFilterGroup(row: Record<string, unknown>, filters: Filter[], parameters: Record<string, unknown>, boolean: string): boolean {
  if (boolean === "or") return filters.some((f) => matchSingleFilter(row, f, parameters));
  return filters.every((f) => matchSingleFilter(row, f, parameters));
}

function matchSingleFilter(row: Record<string, unknown>, filter: Filter, parameters: Record<string, unknown>): boolean {
  if (filter.boolean && filter.filters) return matchFilterGroup(row, filter.filters, parameters, filter.boolean);
  const field = filter.field as string;
  let value = filter.value;
  if (filter.parameter) value = parameters[filter.parameter];
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

// ---------------------------------------------------------------------------
// Anthropic API call (Claude Fable 5 with adaptive thinking)
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const text = (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

  if (!text) throw new Error("Anthropic returned no text content");
  return text;
}
