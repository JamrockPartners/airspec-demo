import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_MODELS = ["gpt-5.5", "gpt-5.5-pro", "gpt-5.6"];
const MAX_RETRIES = 2;

function isOpenAIModel(model: string): boolean {
  return OPENAI_MODELS.includes(model) || model.startsWith("gpt-");
}

// The complete AIRspec 1.1 schema cheatsheet. This is embedded in EVERY
// generation prompt so the model never produces out-of-spec fields. Any field
// not listed here is a generation failure and is rejected by validateSpec.
const SCHEMA_CHEATSHEET = `AIRSPEC 1.1 — COMPLETE SPECIFICATION (exact field names; ANY field not listed here is an error)

TOP-LEVEL (required: airspec, meta, datasets, layout; optional: parameters, theme, interactions):
  airspec: "1.1"                               // const, NOT "1.0"
  meta: { title, description?, tags?:string[] }  // NOT "document"
  parameters?: Parameter[]                     // max 25
  datasets: Dataset[]                          // max 12, REQUIRED
  layout: Component                            // REQUIRED, root is a container
  theme?: { density?, palette?:string[], numberLocale?, chart?:{legendOrient?,gridLines?,fontScale?} }
  interactions?: Interaction[]                 // max 20

PARAMETER (required: id, type, label):
  { id, type, label, description?, required?, hidden?, default?, maxLength?, min?, max?, step?, options? }
  type: "text" | "number" | "boolean" | "date" | "dateRange" | "select" | "multiSelect"  // NOT "singleSelect"
  options (REQUIRED for select/multiSelect): { type:"static", values:[{value,label}] } | { type:"fieldValues", source, field }
    static.values: array of {value:string|number|boolean, label:string}  // NOT a bare array of strings
  dateRange.default: { relative:"today|yesterday|last7Days|last30Days|last90Days|last365Days|weekToDate|monthToDate|quarterToDate|yearToDate|previousWeek|previousMonth|previousQuarter|previousYear" } | { start:"YYYY-MM-DD", end:"YYYY-MM-DD" }

DATASET (required: id, source, operation):
  { id, source, operation, fields?, field?, dimensions?, metrics?, filters?, sort?, limit?, bindings?, pagination? }
  operation: "list" | "aggregate" | "distinct"
    list       -> requires fields (or bindings.fields)
    aggregate  -> requires metrics (or bindings.metrics); optional dimensions
    distinct   -> requires field (or bindings.field)
  fields: string[]                             // list operation
  field: string                                // distinct operation
  dimensions: [{ field, timeUnit?:"day|week|month|quarter|year", alias? }]  // aggregate
  metrics: [{ operation, field?, alias? }]     // aggregate; field REQUIRED unless operation=="count"
    operation: "count"|"countDistinct"|"sum"|"average"|"minimum"|"maximum"|"median"
  filters: Filter[]                            // max 20
    field filter: { field, operator, value?, parameter? }   // "parameter" NOT "parameterRef"
    filter group: { boolean:"and"|"or", filters:Filter[] }
    operator: "equals"|"notEquals"|"in"|"notIn"|"contains"|"startsWith"|"endsWith"|"greaterThan"|"greaterThanOrEqual"|"lessThan"|"lessThanOrEqual"|"between"|"isNull"|"isNotNull"|"isTrue"|"isFalse"  // NOT eq/gt/lte
  sort: [{ field, direction:"ascending"|"descending" }]  // NOT "orderBy"; "ascending" NOT "asc"
  limit: integer (minimum 1; omit entirely for unlimited — do NOT use 0)
  bindings: { fields?, field?, dimensions?, metrics?, filters?, sort?, limit? }  // reactive: parameter switches
    each binding: { parameter, cases:[{equals, value}], default }
    A dataset MUST NOT declare both a literal property AND a binding for that property.
  pagination: { pageSize?:integer }

COMPONENT (every component requires id + type; optional: title, visibleWhen, grid):
  visibleWhen: { parameter, operator, value? }  // single object, NOT an array
  grid: { span?, spanTablet?, spanMobile?, minHeight?, maxHeight?, align?:"start|center|end|stretch" }

  stack:     { id, type:"stack", gap?:"none|small|medium|large", description?, collapsible?, children:Component[] }
  grid:      { id, type:"grid",  gap?:"none|small|medium|large", description?, collapsible?, children:Component[] }
  section:   { id, type:"section", gap?:"none|small|medium|large", description?, collapsible?, children:Component[] }
    // gap is an ENUM string, NOT a number. There is NO "direction", NO "columns" on containers.
  heading:   { id, type:"heading", text:string, level?:1|2|3|4 }   // "text" NOT "content"
  text:      { id, type:"text", text:string }                      // "text" NOT "content"
  divider:   { id, type:"divider" }
  metric:    { id, type:"metric", datasetId, valueField, format?, subtitle?, icon?, prefix?, suffix?, comparison? }
    valueField NOT "field". comparison: { valueField, display?:"percentChange|difference|raw", positiveIs?:"good|bad|neutral" }
    format: { type:"number|currency|percent|date|datetime|duration|text|badge", maximumFractionDigits?, minimumFractionDigits?, notation?:"standard|compact", currency?:"USD", pattern?, unit?, style?, map? }
  table:     { id, type:"table", datasetId, columns:[{ field, label?, format?, align?:"left|center|right", sortable?, width?, conditional? }], pagination?, totals? }
  filterBar: { id, type:"filterBar", parameters:string[] }         // "parameters" NOT "parameterIds"
  emptyState:{ id, type:"emptyState", datasetId, message, icon? }  // datasetId REQUIRED
  chart:     { id, type:"chart", datasetId, graphic } OR { id, type:"chart", datasetId, graphicBinding }
    // NO chartType, NO xField, NO yField, NO colorField, NO xAxisTitle, NO yAxisTitle.
    // Charts are expressed ONLY via AIRMark graphic / graphicBinding (see below).

AIRMARK GRAPHIC (the ONLY way to describe a chart; passed verbatim below):
  unitGraphic:   { mark, encoding, transform?, selections?, width?, height?, config? }
  layeredGraphic:{ layers:[unitGraphic, ...] (2-4 layers), width?, height?, config? }
  mark: "bar"|"line"|"area"|"point"|"circle"|"square"|"tick"|"rect"|"rule"|"text"|"arc"|"boxplot"|"errorband"|"errorbar"
        OR { type:<markType>, color?:"#RRGGBB", opacity?, size?, interpolate?:"linear|monotone|step|step-before|step-after|basis|cardinal", point?, tooltip?, filled?, cornerRadius?, cornerRadiusEnd?, strokeWidth?, strokeDash?, innerRadius?, outerRadius? }
  encoding: { x?, y?, x2?, y2?, xOffset?, yOffset?, color?, fill?, stroke?, opacity?, fillOpacity?, strokeOpacity?, size?, shape?, angle?, theta?, theta2?, radius?, radius2?, strokeDash?, strokeWidth?, text?, tooltip?, detail?, order?, row?, column?, facet? }
    each channel: { field?, type?:"quantitative|temporal|ordinal|nominal", aggregate?, bin?, timeUnit?:"day|week|month|quarter|year", sort?, stack?:"zero|normalize|center", title?, axis?, legend?, scale?, format?, value?, condition? }
    aggregate (channel): "count"|"countDistinct"|"sum"|"average"|"minimum"|"maximum"|"median"
    axis: null | { title?, labelAngle?, labelLimit?, labelOverlap?, orient?:"top|bottom|left|right", grid?, ticks?, tickCount?, format? }
    legend: { title?, orient?:"left|right|top|bottom|top-left|top-right|bottom-left|bottom-right", format? } | null
    scale: { type?:"linear|log|sqrt|pow|time|utc|ordinal|band|point", domain?, range?:string[], scheme?, zero?, nice?, padding? }
    condition: { selection, value?, field?, type? }
  transform: [{ aggregate?:[{op, field?, as}], groupby?, bin?, timeUnit?, stack?, window?, fold?, flatten?, pivot?, filter?, sort?, as? }]
  selections: [{ id, type:"point"|"interval", on?:"click"|"mouseover", fields? }]
  graphicBinding: { parameter, cases:[{equals, value:graphic}], default:graphic }  // parameter switches the whole graphic

INTERACTION (required: id, on, and one of action|actions):
  on: { component, event:"select|selectionClear|rowClick|click|change", selection? }
  action / actions: one of:
    { type:"setParameter", parameter, value } | { type:"setParameter", parameter, valueFrom:{ field, mode?:"scalar|values|range" } }
    { type:"clearParameter", parameter }
    { type:"navigate", route, params?:{...} }
    { type:"openDetail", source, recordIdFrom:{ field } }
    { type:"export", datasetId, format:"csv"|"xlsx" }
    { type:"refresh", datasetIds?:string[] }

ID RULES:
  - ids: ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$ (start with a letter; letters/digits/underscore/hyphen)
  - unique across the ENTIRE document (parameters, datasets, components, selections, interactions).
  - source MUST be the literal id string of an available data source (NOT a UUID, NOT the data-source name).
  - Every datasetId / parameter reference / visibleWhen.parameter / binding.parameter / interaction.on.component MUST reference an id that exists.

BINDING RULES (critical — violations are validation errors):
  - A binding's 'parameter' MUST be type "select" (with options.type "static") or type "boolean".
    NEVER bind to a "number", "text", "date", or "dateRange" parameter — those have no fixed option set to switch on.
  - If you need a discrete switch over numeric values (e.g. bin count, top-N), declare it as a "select" with static numeric options:
      { "id":"bins", "type":"select", "default":10, "options":{ "type":"static", "values":[
        { "value":5,"label":"5" }, { "value":10,"label":"10" }, { "value":20,"label":"20" } ] } }
    NOT as a "number" with min/max/step. A continuous range is NOT a switch.
  - 'cases' MUST cover every declared option value (for select) or both true and false (for boolean). Missing cases are errors.
  - Never enumerate near-identical cases to work around a non-select parameter — that defeats the purpose of switches. Change the parameter to a select with the values you actually want.

CHANNEL RULES (critical — the renderer treats a channel as present only when it has field, aggregate, OR value):
  - A count encoding has NO field — it is valid: { "aggregate":"count", "type":"quantitative", "title":"Frequency" }
  - A constant-value color channel has NO field — it is valid: { "value":"#C7CDD8" }
  - Do NOT report or reject a channel for missing 'field' when it has 'aggregate' or 'value'.

STRICTNESS: Do NOT emit any field not defined above. Unknown fields are validation errors. Use x- prefixed keys ONLY for genuine host extensions.`;

const AIRMARK_REFERENCE = `AIRMARK GRAMMAR — REFERENCE (use this for every chart graphic)

A graphic is either a single unit { mark, encoding, selections? } or a layered { layers:[...] }.
Marks are data-bound via encoding channels. There are NO data sources, NO URLs, NO expression strings anywhere in a graphic.

MARK TYPES: bar, line, area, point, circle, square, tick, rect, rule, text, arc, boxplot, errorband, errorbar
  Use mark objects for styling: { type:"bar", color:"#3264D6", cornerRadiusEnd:4 } or { type:"line", color:"#3264D6", point:true, strokeWidth:2 }

ENCODING CHANNELS (most used): x, y, color, size, opacity, theta, text, tooltip, xOffset, yOffset, facet
  Each channel binds a dataset field: { field:"category", type:"nominal", title:"Category" }
  Types: "quantitative" (numbers), "temporal" (dates), "ordinal" (ordered categories), "nominal" (categories)
  Aggregate on a channel: { field:"total", type:"quantitative", aggregate:"sum", title:"Revenue" }
  Time unit on a channel: { field:"created_at", type:"temporal", timeUnit:"month", title:"Month" }

COMMON PATTERNS:
  Bar chart:     mark "bar", encoding { x:{field,type:"nominal"}, y:{field,type:"quantitative",aggregate:"sum"} }
  Line chart:    mark "line" (object with point:true), encoding { x:{field,type:"temporal" or "nominal"}, y:{field,type:"quantitative"} }
  Stacked bar:   mark "bar", encoding { x:{field,type:"nominal"}, y:{field,type:"quantitative",aggregate:"sum",stack:"zero"}, color:{field,type:"nominal"} }
  Donut/arc:     mark "arc" (object with innerRadius), encoding { theta:{field,type:"quantitative"}, color:{field,type:"nominal"} }
  Scatter:       mark "circle", encoding { x:{field,type:"quantitative"}, y:{field,type:"quantitative"}, color:{field,type:"nominal"}, size:{field,type:"quantitative"} }

DIVERGING / POPULATION PYRAMID RULE:
  Always generate two adjacent span: 6 charts inside a grid with gap: "none".
  Left chart: x encoding gets scale: {"reverse": true, "domain": [0, MAX]}; y-axis defaults (labels outer left).
  Right chart: x encoding gets scale: {"domain": [0, MAX]} (same explicit domain); y encoding gets "axis": null (literal null, suppresses duplicate labels).
  Both charts use mark "bar" with orient "horizontal". The shared y field and domain must be identical.

SELECTIONS (for interactive charts): [{ id:"pickedX", type:"point", on:"click", fields:["category"] }]
  Reference the selection id in an interaction's on.selection and use valueFrom to push selected values to a parameter.

LAYERED GRAPHIC: { layers:[<unitGraphic>, <unitGraphic>] } — e.g. bars + a line overlay. 2 to 4 layers.

PROHIBITED inside any graphic: "data", "url", "values", "format" as a top-level string, expression strings, "transform" funcs beyond the declared set, any field not in the dataset's output.`;

const EXAMPLE_DOC = `EXAMPLE — a valid AIRspec 1.1 reactive document (parameter switches dimensions, metrics, sort, limit, AND the chart graphic):

{
  "airspec": "1.1",
  "meta": { "title": "Reactive Sales Explorer", "description": "Bindings + graphic binding + atomic interactions" },
  "parameters": [
    { "id": "sliceBy", "type": "select", "label": "Slice by", "default": "region",
      "options": { "type": "static", "values": [ { "value": "region", "label": "Region" }, { "value": "status", "label": "Status" } ] } },
    { "id": "metricMode", "type": "select", "label": "Measure", "default": "revenue",
      "options": { "type": "static", "values": [ { "value": "revenue", "label": "Revenue" }, { "value": "orders", "label": "Order count" } ] } },
    { "id": "sortMode", "type": "select", "label": "Sort", "default": "value",
      "options": { "type": "static", "values": [ { "value": "value", "label": "Highest value" }, { "value": "category", "label": "Category" } ] } },
    { "id": "topN", "type": "select", "label": "Show", "default": 10,
      "options": { "type": "static", "values": [ { "value": 5, "label": "Top 5" }, { "value": 10, "label": "Top 10" }, { "value": 25, "label": "Top 25" } ] } },
    { "id": "chartMode", "type": "select", "label": "Chart", "default": "bar",
      "options": { "type": "static", "values": [ { "value": "bar", "label": "Bar" }, { "value": "line", "label": "Line" } ] } },
    { "id": "selectedCategory", "type": "text", "label": "Selected category", "hidden": true }
  ],
  "datasets": [
    { "id": "salesBreakdown", "source": "orders", "operation": "aggregate",
      "bindings": {
        "dimensions": { "parameter": "sliceBy", "cases": [
          { "equals": "region", "value": [{ "field": "region", "alias": "category" }] },
          { "equals": "status", "value": [{ "field": "status", "alias": "category" }] } ],
          "default": [{ "field": "region", "alias": "category" }] },
        "metrics": { "parameter": "metricMode", "cases": [
          { "equals": "revenue", "value": [{ "operation": "sum", "field": "total", "alias": "value" }] },
          { "equals": "orders", "value": [{ "operation": "count", "alias": "value" }] } ],
          "default": [{ "operation": "sum", "field": "total", "alias": "value" }] },
        "sort": { "parameter": "sortMode", "cases": [
          { "equals": "value", "value": [{ "field": "value", "direction": "descending" }] },
          { "equals": "category", "value": [{ "field": "category", "direction": "ascending" }] } ],
          "default": [{ "field": "value", "direction": "descending" }] },
        "limit": { "parameter": "topN", "cases": [
          { "equals": 5, "value": 5 }, { "equals": 10, "value": 10 }, { "equals": 25, "value": 25 } ],
          "default": 10 }
      } }
  ],
  "layout": { "id": "root", "type": "stack", "gap": "medium", "children": [
    { "id": "controls", "type": "filterBar", "parameters": ["sliceBy","metricMode","sortMode","topN","chartMode"] },
    { "id": "salesChart", "type": "chart", "datasetId": "salesBreakdown", "title": "Sales breakdown",
      "graphicBinding": { "parameter": "chartMode", "cases": [
        { "equals": "bar", "value": { "mark": { "type": "bar", "color": "#3264D6", "cornerRadiusEnd": 4 },
          "encoding": { "x": { "field": "category", "type": "nominal", "title": "Category" }, "y": { "field": "value", "type": "quantitative", "title": "Value" } },
          "selections": [{ "id": "pickedCategory", "type": "point", "on": "click", "fields": ["category"] }] } },
        { "equals": "line", "value": { "mark": { "type": "line", "color": "#3264D6", "point": true },
          "encoding": { "x": { "field": "category", "type": "nominal", "title": "Category" }, "y": { "field": "value", "type": "quantitative", "title": "Value" } },
          "selections": [{ "id": "pickedCategory", "type": "point", "on": "click", "fields": ["category"] }] } } ],
        "default": { "mark": { "type": "bar", "color": "#3264D6", "cornerRadiusEnd": 4 },
          "encoding": { "x": { "field": "category", "type": "nominal", "title": "Category" }, "y": { "field": "value", "type": "quantitative", "title": "Value" } },
          "selections": [{ "id": "pickedCategory", "type": "point", "on": "click", "fields": ["category"] }] } } }
  ] },
  "interactions": [
    { "id": "selectCategory", "on": { "component": "salesChart", "event": "select", "selection": "pickedCategory" },
      "actions": [
        { "type": "setParameter", "parameter": "selectedCategory", "valueFrom": { "field": "category", "mode": "scalar" } },
        { "type": "refresh", "datasetIds": ["salesBreakdown"] } ] },
    { "id": "clearCategory", "on": { "component": "salesChart", "event": "selectionClear", "selection": "pickedCategory" },
      "action": { "type": "clearParameter", "parameter": "selectedCategory" } }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || "unknown";
  const clientCountry = req.headers.get("cf-ipcountry") || req.headers.get("x-country-code") || "unknown";
  const clientCity = req.headers.get("cf-ipcity") || req.headers.get("x-city") || "unknown";

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { requirements, sessionId, accountId, reportId, existingSpec, model } = parsedBody;

  if (!requirements) {
    return new Response(
      JSON.stringify({ error: "requirements field is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      try {
        emit({ type: "progress", status: "Initializing...", attempt: 0, totalAttempts: MAX_RETRIES + 1 });

        const selectedModel = (model as string) || "gpt-5.6";

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: dataSources } = await supabase
          .from("airspec_data_sources")
          .select("id, slug, name, description, fields_json, constraints_json")
          .eq("enabled", true);

        const sources = (dataSources ?? []) as DataSourceRow[];

        const sourceReference = sources
          .map((ds) => {
            const fieldDefs = ds.fields_json
              .map((f) => {
                const desc = f.description ? ` — ${f.description}` : "";
                return `      "${f.key || f.name}" (${f.type})${desc}`;
              })
              .join("\n");
            return `  SOURCE id: "${ds.slug}" (name: "${ds.name}"${ds.description ? `, ${ds.description}` : ""})
    FIELDS (EXHAUSTIVE — no other fields exist for this source):
${fieldDefs}
    [END OF FIELDS for "${ds.slug}"]`;
          })
          .join("\n\n");

        const systemPrompt = `You are an AIRspec 1.1 document generator. You produce ONLY a valid AIRspec JSON document — no prose, no markdown, no code fences.

${SCHEMA_CHEATSHEET}

${AIRMARK_REFERENCE}

${EXAMPLE_DOC}

AVAILABLE DATA SOURCES (use the "id" value below as a dataset's "source"):
${sourceReference || "NO DATA SOURCES AVAILABLE — emit a document with a single emptyState component whose datasetId references a dataset with operation 'list' and the first available source, or if truly none, a single heading explaining there is no data."}

CRITICAL FIELD RULE: Every field reference anywhere in the document — datasets (fields, field, dimensions.field, metrics.valueField, sort.field, filters.field), table columns (columns[].field), and chart encodings (encoding.x.field, encoding.y.field, encoding.color.field, etc.) — MUST exactly match one of the field names listed above for the corresponding source. Field names are case-sensitive and exact. Do NOT invent, assume, memorize from training data, or substitute any field name not explicitly listed above. If the user's request implies data that does not map to an available field, use the closest available field.

CRITICAL FORMAT RULE: Number/date formats are ALWAYS objects ({type, maximumFractionDigits, notation, etc.}), NEVER d3 format strings like ",", ".2f", or "%". For grouped digits use {"type":"number","useGrouping":true}; for compact use {"type":"number","notation":"compact"}; for no decimals use {"type":"number","maximumFractionDigits":0}. Axis ticks do NOT group by default.

OUTPUT: one JSON object that conforms to AIRspec 1.1 exactly. Schema keys are case-sensitive. ANY key not in the spec above is a failure.`;

        const anthropicAvailable = !isOpenAIModel(selectedModel) && anthropicKey;
        const openaiAvailable = isOpenAIModel(selectedModel) && openaiKey;

        if (isOpenAIModel(selectedModel) && !openaiKey) {
          emit({ type: "error", message: `OpenAI API key is not configured. Cannot use model "${selectedModel}". Please select an Anthropic model instead.` });
          controller.close();
          return;
        }
        if (!isOpenAIModel(selectedModel) && !anthropicKey) {
          emit({ type: "error", message: `Anthropic API key is not configured. Cannot use model "${selectedModel}". Please select an OpenAI model instead.` });
          controller.close();
          return;
        }

        let specJson: Record<string, unknown> | null = null;
        let validationErrs: string[] = [];
        let modelUsed = selectedModel;
        let lastRawText = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          const statusMsg = attempt === 0
            ? `Generating with ${selectedModel}...`
            : `Retrying (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — fixing ${validationErrs.length} validation error${validationErrs.length !== 1 ? "s" : ""}...`;

          emit({ type: "progress", status: statusMsg, attempt, totalAttempts: MAX_RETRIES + 1 });

          // Start heartbeat to keep the connection alive during LLM call
          let heartbeatCount = 0;
          heartbeatInterval = setInterval(() => {
            heartbeatCount++;
            emit({ type: "heartbeat", elapsed: heartbeatCount * 8, attempt });
          }, 8000);

          const userPrompt = buildUserPrompt(requirements as string, existingSpec as Record<string, unknown> | undefined, attempt, validationErrs);

          let candidate: Record<string, unknown>;
          if (openaiAvailable) {
            candidate = await generateWithOpenAI(openaiKey, selectedModel, systemPrompt, userPrompt);
          } else if (anthropicAvailable) {
            candidate = await generateWithAnthropic(anthropicKey, selectedModel, systemPrompt, userPrompt);
          } else {
            candidate = generateFallbackSpec(requirements as string, sources);
            modelUsed = "fallback";
          }

          // Stop heartbeat after LLM responds
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;

          emit({ type: "progress", status: "Validating spec...", attempt, totalAttempts: MAX_RETRIES + 1 });

          const errs = validateSpec(candidate, sources);
          if (errs.length === 0) {
            specJson = candidate;
            validationErrs = [];
            break;
          }

          validationErrs = errs;
          lastRawText = JSON.stringify(candidate).slice(0, 800);
          console.log(`[airspec-report-generate] attempt ${attempt + 1} failed validation: ${errs.join("; ").slice(0, 400)}`);

          if (attempt === MAX_RETRIES) {
            specJson = candidate;
          }
        }

        if (!specJson) {
          specJson = generateFallbackSpec(requirements as string, sources);
          modelUsed = "fallback";
        }

        emit({ type: "progress", status: "Saving report...", attempt: MAX_RETRIES + 1, totalAttempts: MAX_RETRIES + 1 });

        let finalReportId = reportId as string | undefined;

        if (!finalReportId) {
          const { data: newReport, error: reportErr } = await supabase
            .from("airspec_reports")
            .insert({
              name: (specJson as { meta?: { title?: string } }).meta?.title ?? "Untitled Report",
              account_id: (accountId as string) || "default",
              session_id: (sessionId as string) || null,
              model: selectedModel,
            })
            .select()
            .single();

          if (reportErr) throw new Error(reportErr.message);
          finalReportId = newReport.id;
        }

        const { data: existingVersions } = await supabase
          .from("airspec_report_versions")
          .select("version_number")
          .eq("report_id", finalReportId)
          .order("version_number", { ascending: false })
          .limit(1);

        const nextVersion = ((existingVersions?.[0]?.version_number as number) ?? 0) + 1;

        const { data: version, error: versionErr } = await supabase
          .from("airspec_report_versions")
          .insert({
            report_id: finalReportId,
            version_number: nextVersion,
            schema_version: "1.1",
            user_prompt: requirements,
            report_spec_json: specJson,
            generation_model: modelUsed,
            generation_metadata_json: { sessionId, timestamp: new Date().toISOString(), retries: validationErrs.length > 0 ? MAX_RETRIES : 0, lastRejectedPreview: lastRawText || null },
            validation_status: validationErrs.length === 0 ? "valid" : "invalid",
            validation_errors_json: validationErrs.length > 0 ? validationErrs : null,
          })
          .select()
          .single();

        if (versionErr) throw new Error(versionErr.message);

        await supabase
          .from("airspec_reports")
          .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
          .eq("id", finalReportId);

        // Fire-and-forget email notification via Resend
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          try {
            const reportName = ((requirements as string) || "Untitled Report").replace(/[\r\n]+/g, " ").trim();
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "no-reply@mail.zalkinteractive.com",
                to: "brian@jamrockdev.com",
                subject: `[AIRspec] New Report Generated`,
                html: `
                  <h2>New Report Generated</h2>
                  <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Report</td><td>${reportName}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Report ID</td><td><code>${finalReportId}</code></td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Model</td><td>${modelUsed}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">IP Address</td><td>${clientIp}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Country</td><td>${clientCountry}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">City</td><td>${clientCity}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Timestamp</td><td>${new Date().toISOString()}</td></tr>
                  </table>
                `,
              }),
            });
          } catch (emailErr) {
            console.error("[airspec-report-generate] Email notification failed:", emailErr);
          }
        }

        emit({
          type: "complete",
          reportId: finalReportId,
          versionId: version.id,
          spec: specJson,
          validationErrors: validationErrs.length > 0 ? validationErrs : null,
          model: modelUsed,
        });
      } catch (err) {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        const error = err as Error;
        console.error(`[airspec-report-generate] Error:`, error.message, error.stack);
        emit({ type: "error", message: error.message });
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

function buildUserPrompt(
  requirements: string,
  existingSpec: Record<string, unknown> | undefined,
  attempt: number,
  prevErrors: string[],
): string {
  let p = `Generate an AIRspec 1.1 document for this request:\n\n${requirements}`;
  if (existingSpec) {
    p += `\n\nModify this existing spec (keep its valid parts, fix what's asked). If it is an older 1.0-style document, MIGRATE it to 1.1 (document->meta, singleSelect->select, options array->{type:"static",values}, parameterRef->parameter, orderBy->sort with ascending/descending, groupBy->dimensions, aggregations->metrics with operation, field->valueField on metric, parameterIds->parameters on filterBar, content->text, chartType/xField/yField->AIRMark graphic, visibleWhen array->single object):\n${JSON.stringify(existingSpec)}`;
  }
  if (attempt > 0 && prevErrors.length > 0) {
    p += `\n\nYour previous output was REJECTED because it did not conform to AIRspec 1.1. Fix EVERY error below and return the complete corrected document:\n`;
    p += prevErrors.map((e) => `  - ${e}`).join("\n");
    p += `\n\nRe-read the SCHEMA_CHEATSHEET, AIRMARK_REFERENCE, and EXAMPLE_DOC in the system prompt. Common 1.0->1.1 mistakes: "document" (use "meta"), "singleSelect" (use "select"), bare options arrays (use {type:"static",values:[...]}), "parameterRef" (use "parameter"), "orderBy" (use "sort" with "ascending"/"descending"), "groupBy" (use "dimensions"), "aggregations" with "function" (use "metrics" with "operation"), "field" on metric (use "valueField"), "parameterIds" on filterBar (use "parameters"), "content" (use "text"), chartType/xField/yField (use AIRMark graphic {mark,encoding}), visibleWhen as an array (use a single object), gap as a number (use "none|small|medium|large").`;
  }
  return p;
}

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  console.log(`[Anthropic Generate] model=${model}`);
  const ADAPTIVE_MODELS = ["claude-fable-5"];
  const BUDGET_MODELS = ["claude-opus-4-8"];
  const isAdaptive = ADAPTIVE_MODELS.some((m) => model.includes(m));
  const isBudget = BUDGET_MODELS.some((m) => model.includes(m));

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: isAdaptive || isBudget ? 32000 : 16384,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  };

  if (isAdaptive) {
    requestBody.thinking = { type: "adaptive" };
    requestBody.output_config = { effort: "high" };
  } else if (isBudget) {
    requestBody.thinking = { type: "enabled", budget_tokens: 16000 };
  } else {
    requestBody.temperature = 0.3;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  const rawText = await response.text();
  if (!response.ok) throw new Error(`Anthropic API error (${response.status}): ${rawText}`);

  const data = JSON.parse(rawText);
  const stopReason = data.stop_reason as string | undefined;
  const responseText = (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

  if (!responseText) throw new Error("Anthropic returned empty content");
  if (stopReason === "max_tokens") {
    console.warn(`[Anthropic Generate] Response truncated (max_tokens reached). Text length: ${responseText.length}`);
  }

  return extractJson(responseText, stopReason === "max_tokens");
}

async function generateWithOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  console.log(`[OpenAI Generate] model=${model}`);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 16384,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const rawText = await response.text();
  if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${rawText}`);

  const data = JSON.parse(rawText);
  const finishReason = data.choices?.[0]?.finish_reason as string | undefined;
  const responseText = data.choices?.[0]?.message?.content ?? "";
  if (!responseText) throw new Error("OpenAI returned empty content");
  if (finishReason === "length") {
    console.warn(`[OpenAI Generate] Response truncated (max_tokens reached). Text length: ${responseText.length}`);
  }

  return extractJson(responseText, finishReason === "length");
}

function extractJson(text: string, wasTruncated = false): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (wasTruncated) {
      throw new Error("The generated report was too large and got cut off. Retrying with a more concise output...");
    }
    throw new Error(`Failed to extract JSON. Text: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    if (wasTruncated) {
      throw new Error("The generated report was too large and got cut off mid-way. Retrying with a more concise output...");
    }
    throw new Error(`Failed to parse generated JSON: ${(e as Error).message}. Preview: ${jsonMatch[0].slice(0, 300)}`);
  }
}

interface DataSourceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  fields_json: { name: string; type: string; description?: string }[];
}

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const FORMAT_TYPES = new Set(["number", "currency", "percent", "date", "datetime", "duration", "text", "badge"]);
const PARAM_TYPES = new Set(["text", "number", "boolean", "date", "dateRange", "select", "multiSelect"]);
const FILTER_OPS = new Set(["equals", "notEquals", "in", "notIn", "contains", "startsWith", "endsWith", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "between", "isNull", "isNotNull", "isTrue", "isFalse"]);
const METRIC_OPS = new Set(["count", "countDistinct", "sum", "average", "minimum", "maximum", "median"]);
const MARK_TYPES = new Set(["bar", "line", "area", "point", "circle", "square", "tick", "rect", "rule", "text", "arc", "boxplot", "errorband", "errorbar"]);
const CHANNEL_TYPES = new Set(["quantitative", "temporal", "ordinal", "nominal"]);
const COMPONENT_TYPES = new Set(["stack", "grid", "section", "heading", "text", "divider", "metric", "table", "chart", "filterBar", "emptyState"]);
const GAPS = new Set(["none", "small", "medium", "large"]);

// Deep validation against AIRspec 1.1. Rejects ANY out-of-spec field. This is
// the enforcement layer for the user's hard requirement.
function validateSpec(spec: Record<string, unknown>, sources: DataSourceRow[]): string[] {
  const errors: string[] = [];

  // --- top-level ---
  if (spec.airspec !== "1.1") errors.push(`airspec must be "1.1" (got ${JSON.stringify(spec.airspec)})`);
  const knownTop = new Set(["airspec", "meta", "parameters", "datasets", "layout", "theme", "interactions"]);
  for (const k of Object.keys(spec)) {
    if (!knownTop.has(k) && !k.startsWith("x-")) errors.push(`Unknown top-level field "${k}"`);
  }

  // --- meta ---
  const meta = spec.meta as { title?: string; description?: string; tags?: string[] } | undefined;
  if (!meta) errors.push("Missing top-level 'meta' object (NOT 'document')");
  else {
    if (!meta.title) errors.push("meta.title is required");
    for (const k of Object.keys(meta)) if (!["title", "description", "tags"].includes(k) && !k.startsWith("x-")) errors.push(`meta: unknown field "${k}"`);
  }

  // --- parameters ---
  const parameters = (spec.parameters ?? []) as Record<string, unknown>[];
  const parameterIds = new Set<string>();
  const selectParamOptions = new Map<string, { value: string | number | boolean; label: string }[]>();
  const paramTypes = new Map<string, string>();
  for (const [i, p] of parameters.entries()) {
    const path = `parameters[${i}]`;
    const pid = p.id as string | undefined;
    if (!pid) { errors.push(`${path}: missing 'id'`); continue; }
    if (!ID_RE.test(pid)) errors.push(`${path}: id "${pid}" is not a valid id`);
    if (parameterIds.has(pid)) errors.push(`${path}: duplicate parameter id "${pid}"`);
    parameterIds.add(pid);
    paramTypes.set(pid, p.type as string);
    const allowed = ["id", "type", "label", "description", "required", "hidden", "default", "maxLength", "min", "max", "step", "options"];
    for (const k of Object.keys(p)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}: unknown field "${k}"`);
    if (!PARAM_TYPES.has(p.type as string)) errors.push(`${path}: invalid type "${p.type}"`);
    if (typeof p.label !== "string") errors.push(`${path}: 'label' is required (string)`);
    if ((p.type === "select" || p.type === "multiSelect")) {
      const opts = p.options as Record<string, unknown> | undefined;
      if (!opts) {
        errors.push(`${path}: select/multiSelect requires 'options'`);
      } else if (opts.type === "static") {
        if (!Array.isArray(opts.values)) errors.push(`${path}: options.values must be an array`);
        else {
          const vals: { value: string | number | boolean; label: string }[] = [];
          for (const v of opts.values as Record<string, unknown>[]) {
            if (v.value === undefined || typeof v.label !== "string") errors.push(`${path}: option must be {value,label}`);
            else vals.push({ value: v.value as string | number | boolean, label: v.label });
          }
          selectParamOptions.set(pid, vals);
        }
        for (const k of Object.keys(opts)) if (!["type", "values"].includes(k)) errors.push(`${path}: options: unknown field "${k}"`);
      } else if (opts.type === "fieldValues") {
        if (typeof opts.source !== "string" || typeof opts.field !== "string") errors.push(`${path}: fieldValues options require source and field`);
        for (const k of Object.keys(opts)) if (!["type", "source", "field"].includes(k)) errors.push(`${path}: options: unknown field "${k}"`);
      } else {
        errors.push(`${path}: options.type must be "static" or "fieldValues"`);
      }
    }
  }

  // --- datasets ---
  const validSourceIds = new Set(sources.map((s) => s.slug));
  const sourceFieldMap = new Map(sources.map((s) => [s.slug, new Set(s.fields_json.map((f) => f.key || f.name))]));
  const datasets = (spec.datasets ?? []) as Record<string, unknown>[];
  const datasetIds = new Set<string>();
  for (const [i, ds] of datasets.entries()) {
    const path = `datasets[${i}]`;
    const did = ds.id as string | undefined;
    if (!did) { errors.push(`${path}: missing 'id'`); continue; }
    if (!ID_RE.test(did)) errors.push(`${path}: id "${did}" is not a valid id`);
    if (datasetIds.has(did)) errors.push(`${path}: duplicate dataset id "${did}"`);
    datasetIds.add(did);
    const allowed = ["id", "source", "operation", "fields", "field", "dimensions", "metrics", "filters", "sort", "limit", "bindings", "pagination"];
    for (const k of Object.keys(ds)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}: unknown field "${k}"`);
    if (!validSourceIds.has(ds.source as string)) errors.push(`${path}: source "${ds.source}" is not an available data source id`);
    if (!ID_RE.test(ds.source as string)) errors.push(`${path}: source "${ds.source}" is not a valid id (must match /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, cannot be a raw UUID)`);
    if (!["list", "aggregate", "distinct"].includes(ds.operation as string)) errors.push(`${path}: invalid operation "${ds.operation}"`);
    const bindings = ds.bindings as Record<string, unknown> | undefined;
    const hasBinding = (prop: string) => bindings && bindings[prop] !== undefined;
    if (ds.fields && hasBinding("fields")) errors.push(`${path}: cannot declare both 'fields' and bindings.fields`);
    if (ds.field && hasBinding("field")) errors.push(`${path}: cannot declare both 'field' and bindings.field`);
    if (ds.dimensions && hasBinding("dimensions")) errors.push(`${path}: cannot declare both 'dimensions' and bindings.dimensions`);
    if (ds.metrics && hasBinding("metrics")) errors.push(`${path}: cannot declare both 'metrics' and bindings.metrics`);
    if (ds.filters && hasBinding("filters")) errors.push(`${path}: cannot declare both 'filters' and bindings.filters`);
    if (ds.sort && hasBinding("sort")) errors.push(`${path}: cannot declare both 'sort' and bindings.sort`);
    if (ds.limit !== undefined && hasBinding("limit")) errors.push(`${path}: cannot declare both 'limit' and bindings.limit`);
    if (ds.operation === "list" && !ds.fields && !hasBinding("fields")) errors.push(`${path}: list operation requires 'fields' or bindings.fields`);
    if (ds.operation === "aggregate" && !ds.metrics && !hasBinding("metrics")) errors.push(`${path}: aggregate operation requires 'metrics' or bindings.metrics`);
    if (ds.operation === "distinct" && !ds.field && !hasBinding("field")) errors.push(`${path}: distinct operation requires 'field' or bindings.field`);
    // validate literal/binding field refs against source columns
    const sourceFields = sourceFieldMap.get(ds.source as string);
    const checkField = (f: unknown, ctx: string) => {
      if (typeof f === "string" && sourceFields && !sourceFields.has(f) && !f.includes(".")) {
        const validList = [...sourceFields].join(", ");
        errors.push(`${path}: ${ctx} field "${f}" is not a column in source "${ds.source}". Valid fields are: [${validList}]`);
      }
    };
    if (Array.isArray(ds.fields)) ds.fields.forEach((f) => checkField(f, "fields"));
    if (typeof ds.field === "string") checkField(ds.field, "field");
    if (Array.isArray(ds.dimensions)) ds.dimensions.forEach((d: Record<string, unknown>) => checkField(d.field, "dimensions"));
    if (Array.isArray(ds.metrics)) ds.metrics.forEach((m: Record<string, unknown>) => {
      if (!METRIC_OPS.has(m.operation as string)) errors.push(`${path}: metric operation "${m.operation}" invalid`);
      if (m.operation !== "count" && !m.field) errors.push(`${path}: metric with operation "${m.operation}" requires 'field'`);
      checkField(m.field, "metrics");
    });
    if (Array.isArray(ds.filters)) ds.filters.forEach((f, fi) => validateFilter(f as Record<string, unknown>, parameterIds, sourceFields, `${path}.filters[${fi}]`, errors));
    if (Array.isArray(ds.sort)) ds.sort.forEach((s: Record<string, unknown>) => {
      if (typeof s.field !== "string") errors.push(`${path}: sort entry missing 'field'`);
      if (s.direction !== "ascending" && s.direction !== "descending") errors.push(`${path}: sort direction must be "ascending"|"descending" (got "${s.direction}")`);
    });
    if (ds.format !== undefined) validateFormat(ds.format, `${path}.format`, errors);
    if (bindings) {
      for (const k of Object.keys(bindings)) if (!["fields", "field", "dimensions", "metrics", "filters", "sort", "limit"].includes(k)) errors.push(`${path}.bindings: unknown field "${k}"`);
      const validateBinding = (prop: string, validateValue: (v: unknown, ctx: string) => void) => {
        const b = bindings[prop] as Record<string, unknown> | undefined;
        if (!b) return;
        for (const k of Object.keys(b)) if (!["parameter", "cases", "default"].includes(k)) errors.push(`${path}.bindings.${prop}: unknown field "${k}"`);
        if (!parameterIds.has(b.parameter as string)) errors.push(`${path}.bindings.${prop}: parameter "${b.parameter}" does not exist`);
        const ptype = paramTypes.get(b.parameter as string);
        if (ptype && ptype !== "select" && ptype !== "boolean") errors.push(`${path}.bindings.${prop}: parameter "${b.parameter}" must be select or boolean (got "${ptype}")`);
        const opts = selectParamOptions.get(b.parameter as string) ?? [];
        const optVals = new Set(opts.map((o) => o.value));
        if (!Array.isArray(b.cases)) errors.push(`${path}.bindings.${prop}: 'cases' must be an array`);
        else {
          b.cases.forEach((c: Record<string, unknown>, ci: number) => {
            if (optVals.size && !optVals.has(c.equals as string | number | boolean)) errors.push(`${path}.bindings.${prop}.cases[${ci}]: equals "${c.equals}" is not a declared option of "${b.parameter}"`);
            validateValue(c.value, `${path}.bindings.${prop}.cases[${ci}].value`);
          });
          // Full case coverage: for static-select params, every option value
          // must have a matching case. Boolean params require true+false.
          if (opts.length > 0) {
            const caseVals = new Set((b.cases as Record<string, unknown>[]).map((c) => c.equals));
            for (const o of opts) if (!caseVals.has(o.value)) errors.push(`${path}.bindings.${prop}: missing case for option "${o.value}" of "${b.parameter}"`);
          } else if (ptype === "boolean") {
            const caseVals = new Set((b.cases as Record<string, unknown>[]).map((c) => c.equals));
            if (!caseVals.has(true)) errors.push(`${path}.bindings.${prop}: missing case for true`);
            if (!caseVals.has(false)) errors.push(`${path}.bindings.${prop}: missing case for false`);
          }
        }
        validateValue(b.default, `${path}.bindings.${prop}.default`);
      };
      validateBinding("fields", (v) => { if (!Array.isArray(v)) errors.push(`fields binding value must be array`); else v.forEach((f) => checkField(f, "fields binding")); });
      validateBinding("field", (v) => checkField(v, "field binding"));
      validateBinding("dimensions", (v) => { if (!Array.isArray(v)) errors.push(`dimensions binding value must be array`); else v.forEach((d: Record<string, unknown>) => checkField(d.field, "dimensions binding")); });
      validateBinding("metrics", (v) => { if (!Array.isArray(v)) errors.push(`metrics binding value must be array`); else v.forEach((m: Record<string, unknown>) => { if (!METRIC_OPS.has(m.operation as string)) errors.push(`metrics binding: bad operation`); checkField(m.field, "metrics binding"); }); });
      validateBinding("filters", (v) => { if (!Array.isArray(v)) errors.push(`filters binding value must be array`); else v.forEach((f, fi) => validateFilter(f as Record<string, unknown>, parameterIds, sourceFields, `${path}.filters binding[${fi}]`, errors)); });
      validateBinding("sort", (v) => { if (!Array.isArray(v)) errors.push(`sort binding value must be array`); else v.forEach((s: Record<string, unknown>) => { if (s.direction !== "ascending" && s.direction !== "descending") errors.push(`sort binding: bad direction`); }); });
      validateBinding("limit", (v) => { if (typeof v !== "number" || v < 1) errors.push(`limit binding value must be positive integer`); });
    }
  }

  // --- theme ---
  if (spec.theme) {
    const theme = spec.theme as Record<string, unknown>;
    for (const k of Object.keys(theme)) if (!["density", "palette", "numberLocale", "chart"].includes(k) && !k.startsWith("x-")) errors.push(`theme: unknown field "${k}"`);
  }

  // --- interactions (collect component ids + selection ids first via layout walk) ---
  const componentIds = new Set<string>();
  const selectionIds = new Set<string>();
  // We walk layout first (below) to populate these; interactions validated after.

  // --- layout + components ---
  const allIds = new Set<string>([...datasetIds, ...parameterIds]);
  const layout = spec.layout as Record<string, unknown> | undefined;
  if (!layout) {
    errors.push("Missing top-level 'layout'");
  } else {
    if (!COMPONENT_TYPES.has(layout.type as string)) errors.push(`Root layout type "${layout.type}" invalid`);
    walk(layout, "layout", errors, allIds, componentIds, parameterIds, datasetIds, selectParamOptions, paramTypes, selectionIds);
  }

  // --- interactions (now componentIds + selectionIds are known) ---
  const interactions = (spec.interactions ?? []) as Record<string, unknown>[];
  const interactionIds = new Set<string>();
  for (const [i, it] of interactions.entries()) {
    const path = `interactions[${i}]`;
    for (const k of Object.keys(it)) if (!["id", "on", "action", "actions"].includes(k) && !k.startsWith("x-")) errors.push(`${path}: unknown field "${k}"`);
    const iid = it.id as string | undefined;
    if (!iid) errors.push(`${path}: missing 'id'`);
    else { if (!ID_RE.test(iid)) errors.push(`${path}: id "${iid}" invalid`); if (interactionIds.has(iid)) errors.push(`${path}: duplicate interaction id`); interactionIds.add(iid); }
    const on = it.on as Record<string, unknown> | undefined;
    if (!on) errors.push(`${path}: missing 'on'`);
    else {
      for (const k of Object.keys(on)) if (!["component", "event", "selection"].includes(k)) errors.push(`${path}.on: unknown field "${k}"`);
      if (!componentIds.has(on.component as string)) errors.push(`${path}.on: component "${on.component}" does not exist`);
      if (!["select", "selectionClear", "rowClick", "click", "change"].includes(on.event as string)) errors.push(`${path}.on: invalid event "${on.event}"`);
      if (on.selection && !selectionIds.has(on.selection as string)) errors.push(`${path}.on: selection "${on.selection}" is not declared in any chart graphic`);
    }
    const actions = (it.actions ?? (it.action ? [it.action] : [])) as Record<string, unknown>[];
    if (!it.action && !it.actions) errors.push(`${path}: requires 'action' or 'actions'`);
    for (const [ai, a] of actions.entries()) validateAction(a, `${path}.action${actions.length > 1 ? `[${ai}]` : ""}`, parameterIds, datasetIds, errors);
  }

  return errors;
}

function validateFilter(
  f: Record<string, unknown>,
  parameterIds: Set<string>,
  sourceFields: Set<string> | undefined,
  path: string,
  errors: string[],
) {
  if ("boolean" in f && "filters" in f) {
    if (f.boolean !== "and" && f.boolean !== "or") errors.push(`${path}: filter group boolean must be "and"|"or"`);
    if (!Array.isArray(f.filters)) errors.push(`${path}: filter group 'filters' must be array`);
    else f.filters.forEach((sf, sfi) => validateFilter(sf as Record<string, unknown>, parameterIds, sourceFields, `${path}.filters[${sfi}]`, errors));
    for (const k of Object.keys(f)) if (!["boolean", "filters"].includes(k)) errors.push(`${path}: unknown field "${k}"`);
    return;
  }
  for (const k of Object.keys(f)) if (!["field", "operator", "value", "parameter"].includes(k)) errors.push(`${path}: unknown filter field "${k}"`);
  if (typeof f.field !== "string") errors.push(`${path}: filter missing 'field'`);
  else if (sourceFields && !sourceFields.has(f.field) && !f.field.includes(".")) errors.push(`${path}: field "${f.field}" not in source`);
  if (!FILTER_OPS.has(f.operator as string)) errors.push(`${path}: invalid operator "${f.operator}"`);
  if (f.parameter && !parameterIds.has(f.parameter as string)) errors.push(`${path}: parameter "${f.parameter}" does not exist`);
  if (f.value === undefined && f.parameter === undefined && !["isNull", "isNotNull", "isTrue", "isFalse"].includes(f.operator as string)) {
    errors.push(`${path}: filter needs 'value' or 'parameter' (or a null/bool operator)`);
  }
}

function validateAction(
  a: Record<string, unknown>,
  path: string,
  parameterIds: Set<string>,
  datasetIds: Set<string>,
  errors: string[],
) {
  const t = a.type as string;
  switch (t) {
    case "setParameter": {
      const allowed = ["type", "parameter", "value", "valueFrom"];
      for (const k of Object.keys(a)) if (!allowed.includes(k)) errors.push(`${path}: unknown field "${k}"`);
      if (!parameterIds.has(a.parameter as string)) errors.push(`${path}: parameter "${a.parameter}" does not exist`);
      if (a.value === undefined && !a.valueFrom) errors.push(`${path}: setParameter needs 'value' or 'valueFrom'`);
      if (a.valueFrom) {
        const vf = a.valueFrom as Record<string, unknown>;
        for (const k of Object.keys(vf)) if (!["field", "mode"].includes(k)) errors.push(`${path}.valueFrom: unknown field "${k}"`);
        if (typeof vf.field !== "string") errors.push(`${path}.valueFrom: 'field' required`);
        if (vf.mode && !["scalar", "values", "range"].includes(vf.mode as string)) errors.push(`${path}.valueFrom: invalid mode "${vf.mode}"`);
      }
      break;
    }
    case "clearParameter": {
      for (const k of Object.keys(a)) if (!["type", "parameter"].includes(k)) errors.push(`${path}: unknown field "${k}"`);
      if (!parameterIds.has(a.parameter as string)) errors.push(`${path}: parameter "${a.parameter}" does not exist`);
      break;
    }
    case "navigate":
      for (const k of Object.keys(a)) if (!["type", "route", "params"].includes(k)) errors.push(`${path}: unknown field "${k}"`);
      if (typeof a.route !== "string") errors.push(`${path}: 'route' required`);
      break;
    case "openDetail":
      for (const k of Object.keys(a)) if (!["type", "source", "recordIdFrom"].includes(k)) errors.push(`${path}: unknown field "${k}"`);
      if (typeof a.source !== "string") errors.push(`${path}: 'source' required`);
      if (!(a.recordIdFrom as Record<string, unknown>)?.field) errors.push(`${path}: recordIdFrom.field required`);
      break;
    case "export":
      for (const k of Object.keys(a)) if (!["type", "datasetId", "format"].includes(k)) errors.push(`${path}: unknown field "${k}"`);
      if (!datasetIds.has(a.datasetId as string)) errors.push(`${path}: datasetId "${a.datasetId}" does not exist`);
      if (!["csv", "xlsx"].includes(a.format as string)) errors.push(`${path}: format must be "csv"|"xlsx"`);
      break;
    case "refresh":
      for (const k of Object.keys(a)) if (!["type", "datasetIds"].includes(k)) errors.push(`${path}: unknown field "${k}"`);
      if (Array.isArray(a.datasetIds)) a.datasetIds.forEach((d) => { if (!datasetIds.has(d as string)) errors.push(`${path}: datasetId "${d}" does not exist`); });
      break;
    default:
      errors.push(`${path}: unknown action type "${t}"`);
  }
}

function walk(
  node: Record<string, unknown>,
  path: string,
  errors: string[],
  allIds: Set<string>,
  componentIds: Set<string>,
  parameterIds: Set<string>,
  datasetIds: Set<string>,
  selectParamOptions: Map<string, { value: string | number | boolean; label: string }[]>,
  paramTypes: Map<string, string>,
  selectionIds: Set<string>,
) {
  if (!node || typeof node !== "object") { errors.push(`${path}: component is not an object`); return; }
  const type = node.type as string;
  if (!COMPONENT_TYPES.has(type)) { errors.push(`${path}: unknown component type "${type}"`); return; }

  // id uniqueness
  if (typeof node.id !== "string") {
    errors.push(`${path} (${type}): missing 'id'`);
  } else {
    if (!ID_RE.test(node.id)) errors.push(`${path}: id "${node.id}" invalid`);
    if (allIds.has(node.id)) errors.push(`${path}: duplicate id "${node.id}"`);
    allIds.add(node.id);
    componentIds.add(node.id);
  }

  // visibleWhen is a single object
  if (node.visibleWhen !== undefined) {
    const vw = node.visibleWhen as Record<string, unknown>;
    if (Array.isArray(vw)) errors.push(`${path}: visibleWhen must be a single object, not an array (1.1)`);
    else {
      for (const k of Object.keys(vw)) if (!["parameter", "operator", "value"].includes(k)) errors.push(`${path}.visibleWhen: unknown field "${k}"`);
      if (!parameterIds.has(vw.parameter as string)) errors.push(`${path}.visibleWhen: parameter "${vw.parameter}" does not exist`);
      if (!FILTER_OPS.has(vw.operator as string)) errors.push(`${path}.visibleWhen: invalid operator "${vw.operator}"`);
    }
  }

  // container types
  if (type === "stack" || type === "grid" || type === "section") {
    const allowed = ["id", "type", "title", "visibleWhen", "grid", "gap", "description", "collapsible", "children"];
    for (const k of Object.keys(node)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path} (${type}): unknown field "${k}"`);
    if (node.gap !== undefined && !GAPS.has(node.gap as string)) errors.push(`${path} (${type}): gap must be one of none|small|medium|large (got "${node.gap}")`);
    const children = node.children as Record<string, unknown>[] | undefined;
    if (!Array.isArray(children)) errors.push(`${path} (${type}): 'children' array required`);
    else children.forEach((c, i) => walk(c, `${path}/${type}[${i}]`, errors, allIds, componentIds, parameterIds, datasetIds, selectParamOptions, paramTypes, selectionIds));
    return;
  }

  const allowedByType: Record<string, string[]> = {
    heading: ["id", "type", "title", "visibleWhen", "grid", "text", "level"],
    text: ["id", "type", "title", "visibleWhen", "grid", "text"],
    divider: ["id", "type", "title", "visibleWhen", "grid"],
    metric: ["id", "type", "title", "visibleWhen", "grid", "datasetId", "valueField", "format", "subtitle", "icon", "prefix", "suffix", "comparison"],
    table: ["id", "type", "title", "visibleWhen", "grid", "datasetId", "columns", "pagination", "totals"],
    filterBar: ["id", "type", "title", "visibleWhen", "grid", "parameters"],
    emptyState: ["id", "type", "title", "visibleWhen", "grid", "datasetId", "message", "icon"],
    chart: ["id", "type", "title", "visibleWhen", "grid", "datasetId", "graphic", "graphicBinding"],
  };
  const allowed = allowedByType[type];
  if (allowed) for (const k of Object.keys(node)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path} (${type}): unknown field "${k}"`);

  switch (type) {
    case "heading":
      if (typeof node.text !== "string" || !node.text) errors.push(`${path} (heading): 'text' required (NOT 'content')`);
      if (node.level !== undefined && ![1, 2, 3, 4].includes(node.level as number)) errors.push(`${path} (heading): level must be 1-4`);
      break;
    case "text":
      if (typeof node.text !== "string" || !node.text) errors.push(`${path} (text): 'text' required (NOT 'content')`);
      break;
    case "metric": {
      if (!datasetIds.has(node.datasetId as string)) errors.push(`${path} (metric): datasetId "${node.datasetId}" does not exist`);
      if (typeof node.valueField !== "string") errors.push(`${path} (metric): 'valueField' required (NOT 'field')`);
      if (node.format !== undefined) validateFormat(node.format, `${path} (metric).format`, errors);
      break;
    }
    case "table": {
      if (!datasetIds.has(node.datasetId as string)) errors.push(`${path} (table): datasetId "${node.datasetId}" does not exist`);
      const cols = node.columns as Record<string, unknown>[] | undefined;
      if (!Array.isArray(cols) || cols.length === 0) errors.push(`${path} (table): 'columns' array required`);
      else cols.forEach((c, ci) => {
        for (const k of Object.keys(c)) if (!["field", "label", "format", "align", "sortable", "width", "conditional"].includes(k)) errors.push(`${path}.columns[${ci}]: unknown field "${k}"`);
        if (typeof c.field !== "string") errors.push(`${path}.columns[${ci}]: 'field' required`);
        if (c.format !== undefined) validateFormat(c.format, `${path}.columns[${ci}].format`, errors);
      });
      break;
    }
    case "filterBar": {
      const pids = node.parameters as string[] | undefined;
      if (!Array.isArray(pids)) errors.push(`${path} (filterBar): 'parameters' array required (NOT 'parameterIds')`);
      else pids.forEach((pid) => { if (!parameterIds.has(pid)) errors.push(`${path} (filterBar): parameter "${pid}" does not exist`); });
      break;
    }
    case "emptyState":
      if (!datasetIds.has(node.datasetId as string)) errors.push(`${path} (emptyState): datasetId "${node.datasetId}" does not exist`);
      if (typeof node.message !== "string") errors.push(`${path} (emptyState): 'message' required`);
      break;
    case "chart": {
      if (!datasetIds.has(node.datasetId as string)) errors.push(`${path} (chart): datasetId "${node.datasetId}" does not exist`);
      if (node.graphic && node.graphicBinding) errors.push(`${path} (chart): provide 'graphic' OR 'graphicBinding', not both`);
      if (!node.graphic && !node.graphicBinding) errors.push(`${path} (chart): 'graphic' or 'graphicBinding' required`);
      if (node.graphic) validateGraphic(node.graphic as Record<string, unknown>, `${path} (chart).graphic`, errors, selectionIds);
      if (node.graphicBinding) {
        const gb = node.graphicBinding as Record<string, unknown>;
        for (const k of Object.keys(gb)) if (!["parameter", "cases", "default"].includes(k)) errors.push(`${path}.graphicBinding: unknown field "${k}"`);
        if (!parameterIds.has(gb.parameter as string)) errors.push(`${path}.graphicBinding: parameter "${gb.parameter}" does not exist`);
        const gbPtype = paramTypes.get(gb.parameter as string);
        if (gbPtype && gbPtype !== "select" && gbPtype !== "boolean") errors.push(`${path}.graphicBinding: parameter "${gb.parameter}" must be select or boolean (got "${gbPtype}") — number/text/date parameters cannot drive switches`);
        const opts = selectParamOptions.get(gb.parameter as string) ?? [];
        const optVals = new Set(opts.map((o) => o.value));
        if (Array.isArray(gb.cases)) {
          gb.cases.forEach((c: Record<string, unknown>, ci: number) => {
            if (optVals.size && !optVals.has(c.equals as string | number | boolean)) errors.push(`${path}.graphicBinding.cases[${ci}]: equals not a declared option`);
            validateGraphic(c.value as Record<string, unknown>, `${path}.graphicBinding.cases[${ci}].value`, errors, selectionIds);
          });
          // Full case coverage for graphicBinding.
          if (opts.length > 0) {
            const caseVals = new Set((gb.cases as Record<string, unknown>[]).map((c) => c.equals));
            for (const o of opts) if (!caseVals.has(o.value)) errors.push(`${path}.graphicBinding: missing case for option "${o.value}" of "${gb.parameter}"`);
          } else if (gbPtype === "boolean") {
            const caseVals = new Set((gb.cases as Record<string, unknown>[]).map((c) => c.equals));
            if (!caseVals.has(true)) errors.push(`${path}.graphicBinding: missing case for true`);
            if (!caseVals.has(false)) errors.push(`${path}.graphicBinding: missing case for false`);
          }
        }
        validateGraphic(gb.default as Record<string, unknown>, `${path}.graphicBinding.default`, errors, selectionIds);
      }
      break;
    }
  }
}

function validateGraphic(
  g: Record<string, unknown>,
  path: string,
  errors: string[],
  selectionIds: Set<string>,
) {
  if (!g || typeof g !== "object") { errors.push(`${path}: graphic must be an object`); return; }
  if (Array.isArray(g.layers)) {
    const allowed = ["layers", "width", "height", "config"];
    for (const k of Object.keys(g)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}: layered graphic unknown field "${k}"`);
    if (g.layers.length < 2 || g.layers.length > 4) errors.push(`${path}: layered graphic needs 2-4 layers`);
    g.layers.forEach((layer: Record<string, unknown>, li: number) => validateUnitGraphic(layer, `${path}.layers[${li}]`, errors, selectionIds));
    return;
  }
  validateUnitGraphic(g, path, errors, selectionIds);
}

function validateUnitGraphic(
  g: Record<string, unknown>,
  path: string,
  errors: string[],
  selectionIds: Set<string>,
) {
  const allowed = ["mark", "encoding", "transform", "selections", "width", "height", "config"];
  for (const k of Object.keys(g)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}: unit graphic unknown field "${k}"`);
  const mark = g.mark;
  if (mark === undefined) { errors.push(`${path}: 'mark' required`); }
  else if (typeof mark === "string") {
    if (!MARK_TYPES.has(mark)) errors.push(`${path}: invalid mark type "${mark}"`);
  } else if (typeof mark === "object" && mark !== null) {
    const m = mark as Record<string, unknown>;
    if (!MARK_TYPES.has(m.type as string)) errors.push(`${path}: invalid mark.type "${m.type}"`);
    const markFields = ["type", "color", "opacity", "size", "interpolate", "point", "tooltip", "filled", "cornerRadius", "cornerRadiusEnd", "strokeWidth", "strokeDash", "innerRadius", "outerRadius"];
    for (const k of Object.keys(m)) if (!markFields.includes(k)) errors.push(`${path}.mark: unknown field "${k}"`);
    if (m.color && !HEX_RE.test(m.color as string)) errors.push(`${path}.mark.color must be #RRGGBB`);
  } else {
    errors.push(`${path}: 'mark' must be a string or object`);
  }
  const encoding = g.encoding as Record<string, unknown> | undefined;
  if (!encoding) errors.push(`${path}: 'encoding' required`);
  else {
    const channelNames = ["x", "y", "x2", "y2", "xOffset", "yOffset", "color", "fill", "stroke", "opacity", "fillOpacity", "strokeOpacity", "size", "shape", "angle", "theta", "theta2", "radius", "radius2", "strokeDash", "strokeWidth", "text", "tooltip", "detail", "order", "row", "column", "facet"];
    for (const k of Object.keys(encoding)) if (!channelNames.includes(k) && !k.startsWith("x-")) errors.push(`${path}.encoding: unknown channel "${k}"`);
    for (const [ch, val] of Object.entries(encoding)) {
      if (ch === "tooltip" && Array.isArray(val)) { val.forEach((c) => validateChannel(c as Record<string, unknown>, `${path}.encoding.tooltip`, errors)); continue; }
      validateChannel(val as Record<string, unknown>, `${path}.encoding.${ch}`, errors);
    }
  }
  if (Array.isArray(g.selections)) {
    g.selections.forEach((s: Record<string, unknown>, si: number) => {
      const sp = `${path}.selections[${si}]`;
      for (const k of Object.keys(s)) if (!["id", "type", "on", "fields"].includes(k)) errors.push(`${sp}: unknown field "${k}"`);
      if (!ID_RE.test(s.id as string)) errors.push(`${sp}: invalid id`);
      selectionIds.add(s.id as string);
      if (!["point", "interval"].includes(s.type as string)) errors.push(`${sp}: type must be point|interval`);
      if (s.on && !["click", "mouseover"].includes(s.on as string)) errors.push(`${sp}: on must be click|mouseover`);
    });
  }
}

function validateFormat(val: unknown, path: string, errors: string[]) {
  if (val === null || val === undefined) return;
  if (typeof val === "string") {
    errors.push(`${path}: format must be an object (e.g. {type:"number",maximumFractionDigits:2}), not a string like "${val}"`);
    return;
  }
  if (typeof val !== "object" || Array.isArray(val)) {
    errors.push(`${path}: format must be an object`);
    return;
  }
  const f = val as Record<string, unknown>;
  const allowed = ["type", "maximumFractionDigits", "minimumFractionDigits", "notation", "currency", "pattern", "unit", "style", "map"];
  for (const k of Object.keys(f)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}: format unknown field "${k}"`);
  if (!FORMAT_TYPES.has(f.type as string)) errors.push(`${path}: format.type must be one of number|currency|percent|date|datetime|duration|text|badge (got "${f.type}")`);
}

function validateChannel(c: Record<string, unknown>, path: string, errors: string[]) {
  if (c === null) return;
  if (!c || typeof c !== "object") { errors.push(`${path}: channel must be an object`); return; }
  const allowed = ["field", "type", "aggregate", "bin", "timeUnit", "sort", "stack", "title", "axis", "legend", "scale", "format", "value", "condition"];
  for (const k of Object.keys(c)) if (!allowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}: unknown channel field "${k}"`);
  if (c.type !== undefined && !CHANNEL_TYPES.has(c.type as string)) errors.push(`${path}: invalid type "${c.type}"`);
  if (c.aggregate !== undefined && !METRIC_OPS.has(c.aggregate as string)) errors.push(`${path}: invalid aggregate "${c.aggregate}"`);
  if (c.timeUnit !== undefined && !["day", "week", "month", "quarter", "year"].includes(c.timeUnit as string)) errors.push(`${path}: invalid timeUnit`);
  if (c.stack !== undefined && c.stack !== null && !["zero", "normalize", "center"].includes(c.stack as string)) errors.push(`${path}: invalid stack`);
  if (c.format !== undefined) validateFormat(c.format, `${path}.format`, errors);
  if (c.axis !== undefined && c.axis !== null) {
    const axis = c.axis as Record<string, unknown>;
    const axisAllowed = ["title", "labelAngle", "labelLimit", "labelOverlap", "orient", "grid", "ticks", "tickCount", "format"];
    for (const k of Object.keys(axis)) if (!axisAllowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}.axis: unknown field "${k}"`);
    if (axis.format !== undefined) validateFormat(axis.format, `${path}.axis.format`, errors);
  }
  if (c.legend !== undefined && c.legend !== null) {
    const legend = c.legend as Record<string, unknown>;
    const legendAllowed = ["title", "orient", "format"];
    for (const k of Object.keys(legend)) if (!legendAllowed.includes(k) && !k.startsWith("x-")) errors.push(`${path}.legend: unknown field "${k}"`);
    if (legend.format !== undefined) validateFormat(legend.format, `${path}.legend.format`, errors);
  }
}

function generateFallbackSpec(
  _requirements: string,
  dataSources: DataSourceRow[],
): Record<string, unknown> {
  const source = dataSources[0];
  if (!source) {
    return {
      airspec: "1.1",
      meta: { title: "Empty Report", description: "No data sources available" },
      parameters: [],
      datasets: [{ id: "empty-dataset", source: "none", operation: "list", fields: ["x"] }],
      layout: { id: "root", type: "stack", gap: "medium", children: [
        { id: "empty", type: "emptyState", datasetId: "empty-dataset", message: "No data sources are enabled. Add a data source to generate reports.", icon: "database" },
      ] },
    };
  }

  const numericFields = source.fields_json.filter((f) => f.type === "number");
  const stringFields = source.fields_json.filter((f) => f.type === "string");
  const firstString = stringFields[0]?.name ?? source.fields_json[0]?.name;
  const firstNumeric = numericFields[0]?.name;

  const children: Record<string, unknown>[] = [
    { id: "title", type: "heading", text: `${source.name ?? "Report"} Report`, level: 1 },
  ];

  if (firstString && firstNumeric) {
    children.push({
      id: "main-chart", type: "chart", datasetId: "main-aggregate",
      graphic: {
        mark: { type: "bar", color: "#3264D6", cornerRadiusEnd: 4 },
        encoding: {
          x: { field: firstString, type: "nominal", title: firstString },
          y: { field: firstNumeric, type: "quantitative", aggregate: "sum", title: firstNumeric },
        },
      },
    });
  }

  children.push({
    id: "main-table", type: "table", datasetId: "main-list",
    columns: source.fields_json.slice(0, 6).map((f) => ({ field: f.name, label: f.name })),
  });

  return {
    airspec: "1.1",
    meta: { title: `${source.name ?? "Report"} Report`, description: `Auto-generated report for ${source.name ?? "this data"}` },
    parameters: [],
    datasets: [
      { id: "main-list", source: source.slug, operation: "list", fields: source.fields_json.map((f) => f.name), limit: 100 },
      { id: "main-aggregate", source: source.slug, operation: "aggregate",
        dimensions: [{ field: firstString, alias: firstString }],
        metrics: [{ operation: "sum", field: firstNumeric, alias: firstNumeric }],
        limit: 50 },
    ],
    layout: { id: "root", type: "stack", gap: "medium", children },
  };
}
