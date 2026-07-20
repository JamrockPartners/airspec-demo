import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ROWS = 10000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const url = body?.url as string | undefined;
    let format = body?.format as "json" | "csv" | undefined;
    let rootPath = body?.rootPath as string | undefined | null;

    if (!url || typeof url !== "string") {
      return jsonError(400, "url is required");
    }

    let response: Response;
    try {
      response = await fetch(url, { method: "GET" });
    } catch (err) {
      return jsonError(502, `Remote fetch failed: ${(err as Error).message}`);
    }

    if (!response.ok) {
      return jsonError(502, `Remote endpoint returned ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const text = await response.text();

    if (!format) {
      if (contentType.includes("application/json") || contentType.includes("+json")) {
        format = "json";
      } else if (
        contentType.includes("text/csv") ||
        contentType.includes("text/plain")
      ) {
        format = "csv";
      } else if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        format = "json";
      } else {
        format = "csv";
      }
    }

    let rows: Record<string, unknown>[];
    let detectedRootPath: string | null = null;

    if (format === "json") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return jsonError(502, `Remote response is not valid JSON: ${(err as Error).message}`);
      }
      const result = extractArray(parsed, rootPath ?? undefined);
      rows = result.rows;
      detectedRootPath = result.detectedRootPath;
    } else {
      rows = parseCsv(text);
    }

    const totalRows = rows.length;
    const truncated = totalRows > MAX_ROWS;
    if (truncated) rows = rows.slice(0, MAX_ROWS);

    const fields = inferFields(rows);

    return new Response(
      JSON.stringify({
        rows,
        totalRows,
        truncated,
        format,
        rootPath: detectedRootPath,
        fields,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return jsonError(500, (err as Error).message);
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// Given a parsed JSON payload and an optional dotted path, return the array
// of records. When rootPath is omitted, auto-detect the first array of
// objects in the payload.
interface ExtractResult {
  rows: Record<string, unknown>[];
  detectedRootPath: string | null;
}

function extractArray(parsed: unknown, rootPath?: string): ExtractResult {
  if (rootPath) {
    const arr = walkPath(parsed, rootPath);
    if (Array.isArray(arr)) {
      return { rows: coerceRows(arr), detectedRootPath: rootPath };
    }
    return { rows: [], detectedRootPath: rootPath };
  }

  if (Array.isArray(parsed)) {
    return { rows: coerceRows(parsed), detectedRootPath: null };
  }

  const found = findFirstObjectArray(parsed, []);
  if (found) {
    return { rows: coerceRows(found.arr), detectedRootPath: found.path.join(".") };
  }

  // No nested array found; wrap a single object as one row.
  if (parsed && typeof parsed === "object") {
    return { rows: [parsed as Record<string, unknown>], detectedRootPath: null };
  }
  return { rows: [], detectedRootPath: null };
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

interface FoundArray {
  arr: unknown[];
  path: string[];
}

// BFS through object properties looking for the first array whose items are
// plain objects. This matches the common pattern of { "departments": [...] }.
function findFirstObjectArray(value: unknown, path: string[]): FoundArray | null {
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

type FieldType = "string" | "number" | "boolean" | "object" | "array";

interface FieldDef { name: string; key: string; type: FieldType }

function slugifyFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_+$/g, '')
    .replace(/_+/g, '_') || 'field';
}

function inferFields(rows: Record<string, unknown>[]): FieldDef[] {
  if (rows.length === 0) return [];
  const sampleSize = Math.min(rows.length, 100);
  const fieldNames = new Set<string>();
  for (const row of rows.slice(0, sampleSize)) {
    for (const key of Object.keys(row)) fieldNames.add(key);
  }
  return [...fieldNames].map((name) => {
    let numeric = 0, boolean = 0, objectCount = 0, arrayCount = 0, nonEmpty = 0;
    for (const row of rows.slice(0, sampleSize)) {
      const val = row[name];
      if (val === null || val === undefined) continue;
      if (Array.isArray(val)) { nonEmpty++; arrayCount++; continue; }
      if (typeof val === "object") { nonEmpty++; objectCount++; continue; }
      const str = String(val).trim();
      if (str === "" || str === "null" || str === "NaN") continue;
      nonEmpty++;
      if (!isNaN(Number(str)) && str !== "") numeric++;
      if (str === "true" || str === "false") boolean++;
    }
    let type: FieldType = "string";
    if (nonEmpty > 0) {
      if (objectCount / nonEmpty > 0.5) type = "object";
      else if (arrayCount / nonEmpty > 0.5) type = "array";
      else if (numeric / nonEmpty > 0.9) type = "number";
      else if (boolean / nonEmpty > 0.9) type = "boolean";
    }
    return { name, key: slugifyFieldName(name), type };
  });
}
