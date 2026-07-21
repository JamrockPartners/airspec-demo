# AIRspec

**AI Reporting Specification**

*A declarative, safety-first specification for AI-generated dynamic reports.*

**Version:** 1.1.0-draft
**Status:** Draft
**License:** MIT (recommended for adopters; choose your own)
**Media type:** `application/airspec+json`
**Schema ID convention:** `https://airspec.dev/schema/1.1/airspec.schema.json`

---

## Abstract

AIRspec defines a portable JSON document format — the **AIRspec Document** — that describes a complete interactive report: its parameters, data requirements, layout, components, visualizations, theming, and interactions.

AIRspec is designed for a specific and increasingly common architecture: an AI model generates the report *definition*, and a trusted host application interprets that definition to render the report. The generated document is treated as **untrusted configuration, never executable code**.

Visualizations are expressed in **AIRMark**, AIRspec's own declarative visualization grammar. AIRMark describes charts as data-bound marks and encodings, with no data-loading surface, no URLs, and no expression evaluation of any kind — the unsafe capabilities common to general-purpose chart grammars are structurally absent rather than merely disabled.

AIRspec is host-agnostic, data-agnostic, and model-agnostic. Any application that can (a) validate JSON, (b) execute logical dataset requests against its own data layer, and (c) render a set of trusted components can implement AIRspec.

---

## Table of Contents

1. [Conformance and Terminology](#1-conformance-and-terminology)
2. [Design Principles](#2-design-principles)
3. [Document Structure](#3-document-structure)
4. [Versioning](#4-versioning)
5. [Parameters](#5-parameters)
6. [Data Model](#6-data-model)
7. [Datasets](#7-datasets)
8. [Layout and Components](#8-layout-and-components)
9. [Component Reference](#9-component-reference)
10. [AIRMark: The AIRspec Mark Grammar](#10-airmark-the-airspec-mark-grammar)
11. [Formatting](#11-formatting)
12. [Theming](#12-theming)
13. [Interactions and Actions](#13-interactions-and-actions)
14. [Validation Layers](#14-validation-layers)
15. [Security Requirements](#15-security-requirements)
16. [Limits](#16-limits)
17. [Conformance Classes](#17-conformance-classes)
18. [Complete Example Document](#18-complete-example-document)
19. [Appendix A: Reserved Property Names](#appendix-a-reserved-property-names)
20. [Appendix B: JSON Schema Skeleton](#appendix-b-json-schema-skeleton)
21. [Acknowledgments](#acknowledgments)

---

## 1. Conformance and Terminology

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

| Term | Definition |
| --- | --- |
| **AIRspec Document** | A JSON document conforming to this specification that fully describes one report version. |
| **Generator** | The system (typically an AI model plus orchestration) that produces AIRspec Documents. |
| **Host** | The trusted application that validates, stores, and renders AIRspec Documents. |
| **Renderer** | The Host subsystem that maps AIRspec component nodes to trusted UI components. |
| **Data Broker** | The Host's trusted server-side service that executes dataset requests with real credentials and authorization. |
| **Source** | A logical, named data concept exposed by the Host (e.g. `orders`, `users`, `events`). Never a URL. |
| **Source Catalog** | The Host-published description of all Sources, their fields, capabilities, and limits, provided to the Generator. |
| **Dataset** | A declarative request within a document against exactly one Source. |
| **Component** | A node in the layout tree rendered by a trusted UI component. |
| **AIRMark** | The AIRspec visualization grammar defined in §10. |

---

## 2. Design Principles

Implementations and extensions of AIRspec MUST preserve these five principles:

1. **Configuration, not code.** An AIRspec Document contains no executable content of any kind. Hosts MUST NOT evaluate any string in a document as code (`eval`, `new Function`, expression parsers, template engines with logic, dynamic imports).
2. **Logical data access only.** Documents reference Sources and fields by logical name. Documents MUST NOT contain URLs, connection strings, credentials, SQL, or any physical addressing of data.
3. **Deny by default.** Anything not explicitly allowlisted by this specification or a declared Host extension MUST be rejected or stripped. Unknown properties are not silently rendered.
4. **Immutability.** A published document is an immutable version. Any change produces a new document. Runtime execution references stored documents by version; clients MUST NOT submit dataset definitions at execution time.
5. **Fail soft, per component.** A single invalid or failing component MUST NOT prevent unrelated components in the same document from rendering.

---

## 3. Document Structure

An AIRspec Document is a single JSON object.

```json
{
  "airspec": "1.1",
  "meta": {
    "title": "Quarterly Sales Overview",
    "description": "Revenue and order activity for the selected period.",
    "tags": ["sales", "generated"]
  },
  "parameters": [],
  "datasets": [],
  "layout": {},
  "theme": {},
  "interactions": []
}
```

### 3.1 Top-level properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `airspec` | string | **MUST** | Specification version this document targets, e.g. `"1.1"`. |
| `meta` | object | **MUST** | Report metadata. `meta.title` is REQUIRED; `description`, `tags`, and Host-declared metadata extensions are OPTIONAL. |
| `datasets` | array | **MUST** | Zero or more Dataset objects (§7). MAY be empty for static/text-only reports. |
| `layout` | object | **MUST** | The root Component node (§8). |
| `parameters` | array | MAY | User-adjustable report inputs (§5). |
| `theme` | object | MAY | Report-level visual overrides (§12). |
| `interactions` | array | MAY | Approved cross-component behaviors (§13). |
| `x-*` | any | MAY | Host extension properties (§3.2). |

Documents MUST NOT contain top-level properties other than those above. Hosts MUST reject documents containing unrecognized non-extension top-level properties.

### 3.2 Extensions

Hosts MAY define extension properties. All extension property names, at every level of the document, MUST begin with `x-` (e.g. `x-acmeExportProfile`). Renderers that do not recognize an extension MUST ignore it. Extensions MUST NOT alter or relax the security requirements in §15.

### 3.3 Identifiers

Every Parameter, Dataset, and Component MUST have an `id`.

* IDs MUST match `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`.
* IDs MUST be unique within their namespace (parameters, datasets, components each form one namespace).
* IDs are stable references; regenerating a report SHOULD preserve IDs for unchanged elements so Hosts can diff versions.

---

## 4. Versioning

* The specification uses semantic versioning. The `airspec` property carries `MAJOR.MINOR`.
* Within a MAJOR version, additions are backward compatible: a `1.2` renderer MUST render a valid `1.0` document.
* A renderer encountering a document with a higher MINOR version than it supports SHOULD render it, ignoring unrecognized OPTIONAL properties, and MAY surface a compatibility notice.
* A renderer encountering a higher MAJOR version MUST NOT attempt to render it.

---

## 5. Parameters

Parameters are the user-controlled inputs of a report (filters, toggles, selections). Parameter *values* are supplied at run time by the Host, never embedded as trusted data by the Generator.

### 5.1 Parameter object

```json
{
  "id": "dateRange",
  "type": "dateRange",
  "label": "Date Range",
  "required": true,
  "default": { "relative": "last90Days" }
}
```

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | MUST | Identifier (§3.3). |
| `type` | string | MUST | One of the parameter types below. |
| `label` | string | MUST | Human-readable label. |
| `description` | string | MAY | Help text. |
| `required` | boolean | MAY | Default `false`. |
| `default` | varies | MAY | Type-dependent default value. |
| `hidden` | boolean | MAY | Present in datasets but not shown in UI. Default `false`. |

### 5.2 Parameter types

| Type | Value shape | Notes |
| --- | --- | --- |
| `text` | string | Optional `maxLength`. |
| `number` | number | Optional `min`, `max`, `step`. |
| `boolean` | boolean | |
| `date` | ISO 8601 date string | Optional `min`, `max`. |
| `dateRange` | `{ "start": date, "end": date }` or `{ "relative": <token> }` | See §5.3. |
| `select` | single option value | Requires `options` (§5.4). |
| `multiSelect` | array of option values | Requires `options` (§5.4). |

### 5.3 Relative date tokens

`dateRange` defaults and values MAY use relative tokens, resolved by the Host at execution time in the report viewer's timezone unless the Host specifies otherwise:

```
today, yesterday, last7Days, last30Days, last90Days, last365Days,
weekToDate, monthToDate, quarterToDate, yearToDate,
previousWeek, previousMonth, previousQuarter, previousYear
```

Hosts MAY extend this token set via a declared extension; Generators MUST only use tokens present in the Host's generation context.

### 5.4 Select options

Options are either static or derived from a Source field:

```json
{ "options": { "type": "static", "values": [ { "value": "open", "label": "Open" } ] } }
```

```json
{ "options": { "type": "fieldValues", "source": "orders", "field": "status" } }
```

For `fieldValues`, the Data Broker resolves distinct values server-side with the viewer's authorization. Documents MUST NOT embed option lists that circumvent authorization.

### 5.5 Validation

The Host MUST validate every submitted parameter value against the parameter's declared type and constraints before it is used in any dataset execution.

---

## 6. Data Model

### 6.1 Sources and the Source Catalog

The Host publishes a Source Catalog to the Generator. A Source Catalog MUST conform to the published schema at `schema/1.0/catalog.schema.json`. The catalog instance determines which sources, fields, operators, aggregations, routes, and limits a given document may use.

A catalog entry MUST include, per source: `id`, `label`, supported `operations` (`list`, `aggregate`, `distinct`), and a `fields` map. It MAY include a `description`, allowed relationships, and source-specific `limits`.

A catalog field SHOULD declare:

```json
{
  "type": "string | number | integer | boolean | date | datetime | enum | currency | percent | duration",
  "label": "Order Total",
  "description": "Total order value including tax.",
  "filterable": true,
  "groupable": false,
  "sortable": true,
  "aggregations": ["sum", "average", "minimum", "maximum"],
  "timeUnits": ["day", "week", "month", "quarter", "year"],
  "values": ["Open", "Closed"]
}
```

A field MAY declare `"derivable": false`; a source MAY declare `"derivationsEnabled": false`. The Data Broker MUST reject a derived expression that references a non-derivable field or belongs to a source with document derivations disabled.

### 6.2 Field references

Everywhere a document references data, it references catalog field names (or dataset aliases) as plain strings. Field references MUST match `^[a-zA-Z][a-zA-Z0-9_.]{0,127}$`. Dots MAY denote catalog-declared nested fields only.

---

## 7. Datasets

A Dataset is a declarative request against exactly one Source. Datasets contain no URLs and no credentials.

### 7.1 Common properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | MUST | Identifier. |
| `source` | string | MUST | Catalog source ID. |
| `operation` | string | MUST | `list`, `aggregate`, or `distinct`. |
| `derived` | array | MAY | Structured row-level derived fields, evaluated before filtering and aggregation (§7.3.1). Maximum 8. |
| `filters` | array | MAY | Filter objects (§7.4). |
| `sort` | array | MAY | Sort objects (§7.5). |
| `limit` | integer | MAY | Row cap; the Host clamps to catalog limits. |
| `bindings` | object | MAY | Typed parameter switches for approved Dataset properties (§7.6). AIRspec 1.1. |

### 7.2 `list` datasets

```json
{
  "id": "orderDetails",
  "source": "orders",
  "operation": "list",
  "fields": ["order_id", "created_at", "status", "total"],
  "filters": [
    { "field": "created_at", "operator": "between", "parameter": "dateRange" }
  ],
  "sort": [{ "field": "created_at", "direction": "descending" }],
  "pagination": { "pageSize": 50 }
}
```

* `fields` MUST list only catalog fields of the source.
* `pagination.pageSize` MUST NOT exceed the Host's table page-size limit.

### 7.3 `aggregate` datasets

```json
{
  "id": "revenueByMonth",
  "source": "orders",
  "operation": "aggregate",
  "filters": [
    { "field": "created_at", "operator": "between", "parameter": "dateRange" }
  ],
  "dimensions": [
    { "field": "created_at", "timeUnit": "month", "alias": "month" },
    { "field": "region", "alias": "region" }
  ],
  "metrics": [
    { "operation": "sum", "field": "total", "alias": "revenue" },
    { "operation": "count", "alias": "orderCount" }
  ],
  "sort": [{ "field": "month", "direction": "ascending" }]
}
```

**Dimensions.** `field` MUST be groupable per the catalog. `timeUnit` MAY be used only on date/datetime fields and only with catalog-declared units. `alias` names the output column; aliases share the field-reference grammar and MUST be unique within the dataset's output.

**Metrics.** Every metric MUST declare an `alias` and takes exactly one of two forms. An aggregate-form metric declares `operation` and, except for `count`, `field`; the operation is one of `count`, `countDistinct`, `sum`, `average`, `minimum`, `maximum`, `median` and MUST appear in the referenced field's catalog `aggregations`. A calc-form metric declares `calc` instead of `operation` or `field` and is evaluated after aggregation. `label` MAY supply display text for either form. Hosts MAY support additional aggregate operations via catalog declaration.

#### 7.3.1 Row-level derived fields

`dataset.derived` is an ordered array of at most 8 fields computed by the Data Broker before filters, grouping, and aggregation. Each entry has a REQUIRED `alias`, a REQUIRED structured `expr`, and an optional `label`:

```json
"derived": [
  {
    "alias": "line_revenue",
    "label": "Line Revenue",
    "expr": { "multiply": ["quantity", "price"] }
  }
]
```

Once defined, an alias is usable wherever a field is accepted, including later derived expressions, filters, list `fields`, aggregate metrics, and sorts. Derived aliases MAY reference only catalog fields or aliases earlier in the same `derived` array. Forward references and cycles MUST be rejected.

#### 7.3.2 Structured arithmetic and calculated metrics

A derived expression is a closed JSON tree with exactly one operation key: `add`, `subtract`, `multiply`, or `divide`. Operands are field references, finite JSON numbers, or nested expression nodes. `divide` has exactly two operands; the other operations have 2–8. Expression depth MUST NOT exceed 4 and total nodes per expression MUST NOT exceed 16.

Calc-form metrics use the same tree after aggregation and MAY reference only sibling metric aliases. Hosts MUST resolve their dependency order and reject cycles:

```json
"metrics": [
  { "operation": "sum", "field": "line_revenue", "alias": "revenue" },
  { "operation": "count", "alias": "orders" },
  { "alias": "avg_order_value", "calc": { "divide": ["revenue", "orders"] } }
]
```

All referenced fields and aliases MUST be numeric. Arithmetic uses IEEE-754 double precision and folds operand arrays left-to-right. A null or missing operand produces null; division by zero produces null, never Infinity, NaN, or an error. Existing aggregations skip nulls; a calc-form metric with a null input produces null. Derived and metric output columns are keyed by their aliases verbatim. Aliases share one Dataset output namespace; collisions among source fields, derived fields, dimensions, and metrics MUST be rejected.

This algebra does not authorize expression evaluation. Hosts MUST NOT parse or execute strings as formulas. Templates, interpolation, strings such as `datum.price * datum.quantity`, and identifier-encoded formulas such as `eq_price_times_quantity` are forbidden. Name-encoding an operation is the same unsafe grammar with worse syntax; the structured tree is the only arithmetic form.

For authorization, a derived field inherits the highest classification of every component field. Policy is checked against that effective classification. Derivation grants no access to a component field the viewer could not already read. Catalog fields marked `derivable: false` and sources marked `derivationsEnabled: false` MUST reject derivation.

### 7.4 Filters

```json
{ "field": "status", "operator": "in", "value": ["Open", "Pending"] }
{ "field": "created_at", "operator": "between", "parameter": "dateRange" }
```

A filter MUST supply exactly one of `value` (a literal) or `parameter` (a parameter ID whose type is compatible with the operator).

Standard operators:

```
equals, notEquals, in, notIn, contains, startsWith, endsWith,
greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual,
between, isNull, isNotNull, isTrue, isFalse
```

The Data Broker MUST reject any operator not approved for the referenced field. Filters MAY be combined with an optional boolean group wrapper:

```json
{ "boolean": "or", "filters": [ ... ] }
```

Nesting depth of boolean groups MUST NOT exceed 3.

### 7.5 Sort

```json
{ "field": "revenue", "direction": "descending" }
```

`field` references a source field (for `list`) or an output alias (for `aggregate`). `direction` is `ascending` or `descending`.

### 7.6 Reactive dataset bindings

AIRspec 1.1 allows a validated parameter to select among fully declared alternatives for an approved dataset property. This supports sorting, slicing, metric selection, time granularity, Top-N, and related query interactions without duplicating datasets or constructing requests dynamically.

```json
{
  "id": "letterFrequency",
  "source": "alphabet",
  "operation": "aggregate",
  "dimensions": [{ "field": "letter", "alias": "category" }],
  "metrics": [{ "operation": "average", "field": "frequency", "alias": "value" }],
  "bindings": {
    "sort": {
      "parameter": "sortMode",
      "cases": [
        {
          "equals": "frequency",
          "value": [{ "field": "value", "direction": "descending" }]
        },
        {
          "equals": "alphabetical",
          "value": [{ "field": "category", "direction": "ascending" }]
        }
      ],
      "default": [{ "field": "value", "direction": "descending" }]
    }
  }
}
```

The allowed binding targets are:

| Target | Dataset operation | Bound value |
| --- | --- | --- |
| `fields` | `list` | Complete returned-field array. |
| `field` | `distinct` | Distinct source field. |
| `dimensions` | `aggregate` | Complete dimension array, including aliases and time units. |
| `metrics` | `aggregate` | Complete metric array, including stable aliases. |
| `filters` | any | Complete filter array. Existing direct `filter.parameter` bindings remain preferred for changing filter values. |
| `sort` | `list`, `aggregate` | Complete sort array. |
| `limit` | `list`, `aggregate` | Positive integer row limit. |

`id`, `source`, `operation`, `pagination`, credentials, endpoints, and extension properties are not bindable.

Each binding is a parameter switch with `parameter`, `cases`, and `default`. The referenced parameter MUST be a boolean or a `select` parameter with static options. Every case has a unique literal `equals` value and a typed `value`. Cases MUST cover every static option. The REQUIRED `default` is used when the parameter is absent or cleared.

A Dataset MUST NOT declare both a literal property and a binding for that property. A binding replaces its property completely; values are never merged, appended, interpolated, or patched. Every case and default MUST independently pass schema, semantic, and authorization validation.

The Dataset's **stable output contract** is the intersection of the output field names produced by every possible resolved case. Every field referenced by a bound Component MUST be present in that stable output contract. Structural alternatives SHOULD use stable aliases such as `category` and `value` so Components remain valid across state changes.

Hosts MUST resolve bindings before execution, include all affecting parameters in the Dataset cache key, re-check authorization for the resolved request, and reject stale responses from older parameter-state revisions.

### 7.7 `distinct` datasets

Return distinct values of a single filterable field, primarily to back select parameters. Properties: `field` (MUST), plus common properties.

### 7.8 Execution contract

At run time the client submits only: document version reference, dataset `id`, validated parameter values, and pagination. The Data Broker loads the stored dataset definition, applies authorization, compiles structured derived trees using only allowlisted arithmetic operators and catalog-mapped columns, computes row-level derivations before filters and aggregation, computes calc-form metrics after aggregation, executes with server-held credentials, and returns rows shaped as an array of flat JSON objects keyed by field name or alias. Document strings MUST never be assembled into executable backend expressions:

```json
{
  "rows": [ { "month": "2026-01-01", "region": "West", "revenue": 120400.5, "orderCount": 342 } ],
  "page": { "number": 1, "size": 50, "totalRows": 1204 },
  "truncated": false
}
```

---

## 8. Layout and Components

`layout` is the root of a tree of Component nodes. Container components have `children`; leaf components bind to datasets and render content.

### 8.1 Common component properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | MUST | Identifier. |
| `type` | string | MUST | A component type from §9 or a Host-declared `x-` extension type. |
| `title` | string | MAY | Rendered heading for the component. |
| `visibleWhen` | object | MAY | Visibility condition (§8.3). |
| `grid` | object | MAY | Grid placement (§8.2). |
| `x-*` | any | MAY | Extension properties. |

### 8.2 Grid placement

Layout uses a responsive 12-column grid.

```json
{
  "grid": {
    "span": 6,
    "spanTablet": 12,
    "spanMobile": 12,
    "minHeight": 320,
    "maxHeight": 640
  }
}
```

Renderers MUST apply safe defaults for omitted values (`span: 12`) and MUST clamp heights to Host maximums. The layout tree depth MUST NOT exceed the Host's `maxDepth` limit (§16).

### 8.3 Visibility conditions

```json
{ "visibleWhen": { "parameter": "showDetails", "operator": "isTrue" } }
```

`visibleWhen` supports parameter-based conditions using the filter operator set with literal `value` comparisons only. It is a display hint; it MUST NOT be treated as an authorization mechanism.

---

## 9. Component Reference

### 9.1 Containers

| Type | Purpose | Notes |
| --- | --- | --- |
| `stack` | Vertical flow of children. | `gap`: `none` \| `small` \| `medium` \| `large`. |
| `grid` | 12-column grid of children. | `gap` as above; children use `grid.span`. |
| `section` | Titled grouping with optional description. | MAY be collapsible via `collapsible: true`. |

### 9.2 Text

| Type | Purpose | Content rules |
| --- | --- | --- |
| `heading` | Section heading. | `text` (MUST), `level` 1–4. Plain text only. |
| `text` | Paragraph content. | `text` (MUST). Restricted inline markup only: bold, italic, and links to approved route IDs (§13). **No raw HTML.** |
| `divider` | Horizontal rule. | No content. |

### 9.3 `metric`

A single prominent value.

```json
{
  "id": "totalRevenue",
  "type": "metric",
  "datasetId": "totals",
  "title": "Total Revenue",
  "valueField": "revenue",
  "format": { "type": "currency", "currency": "USD", "maximumFractionDigits": 0 },
  "comparison": {
    "valueField": "previousRevenue",
    "display": "percentChange",
    "positiveIs": "good"
  },
  "grid": { "span": 3 }
}
```

`datasetId` and `valueField` are REQUIRED. If the dataset returns multiple rows, the metric uses the first row; Generators SHOULD bind metrics to single-row aggregate datasets.

### 9.4 `table`

```json
{
  "id": "orderTable",
  "type": "table",
  "datasetId": "orderDetails",
  "columns": [
    { "field": "order_id", "label": "Order #", "sortable": true },
    { "field": "created_at", "label": "Created", "format": { "type": "date", "pattern": "MMM d, yyyy" } },
    { "field": "status", "label": "Status", "format": { "type": "badge" } },
    { "field": "total", "label": "Total", "align": "right",
      "format": { "type": "currency", "currency": "USD" },
      "conditional": [
        { "operator": "greaterThan", "value": 10000, "style": "emphasisPositive" }
      ]
    }
  ],
  "pagination": { "enabled": true, "pageSize": 50 },
  "grid": { "span": 12 }
}
```

* Every `columns[].field` MUST be present in the bound dataset's output; renderers MUST reject columns referencing absent fields.
* `conditional` styles come from a fixed token set: `emphasisPositive`, `emphasisNegative`, `emphasisNeutral`, `muted`, `warning`. No arbitrary CSS.
* Optional `totals` row: `{ "enabled": true, "fields": ["total"] }` — computed by the Host from returned rows only.

### 9.5 `chart`

Binds a dataset to an AIRMark visualization (§10).

```json
{
  "id": "revenueChart",
  "type": "chart",
  "datasetId": "revenueByMonth",
  "title": "Revenue by Month",
  "grid": { "span": 8, "minHeight": 320 },
  "graphic": { }
}
```

`datasetId` is REQUIRED. A chart MUST declare exactly one of `graphic` or `graphicBinding`.

AIRspec 1.1 `graphicBinding` lets a boolean or static `select` parameter choose among complete AIRMark graphics:

```json
{
  "id": "frequencyChart",
  "type": "chart",
  "datasetId": "letterFrequency",
  "graphicBinding": {
    "parameter": "chartMode",
    "cases": [
      { "equals": "bar", "value": { "mark": "bar", "encoding": {} } },
      { "equals": "line", "value": { "mark": "line", "encoding": {} } }
    ],
    "default": { "mark": "bar", "encoding": {} }
  }
}
```

Every case and default MUST independently pass AIRMark validation and MAY reference only fields in the Dataset's stable output contract (§7.6). A graphic binding replaces the whole graphic; it cannot patch properties or introduce data, expressions, URLs, or external runtime configuration.

### 9.6 `filterBar`

Renders parameter controls.

```json
{ "id": "filters", "type": "filterBar", "parameters": ["dateRange", "region"] }
```

Every referenced parameter ID MUST exist in `parameters`.

### 9.7 `emptyState`

Fallback content shown when a referenced dataset returns zero rows: `datasetId`, `message`, optional `icon` from the Host icon registry.

---

## 10. AIRMark: The AIRspec Mark Grammar

AIRMark is AIRspec's declarative grammar for charts. A `graphic` object describes **what to draw** — marks, encodings, guides, and composition — and never **where data comes from** or **how to compute with code**. Data always arrives from the bound Dataset; logic always lives in the trusted Host.

An AIRMark object is one of:

* A **unit** graphic: `{ "mark": ..., "encoding": ..., "transform"?, "config"? }`
* A **layered** graphic: `{ "layers": [ <unit>, ... ], "config"? }`
* A **faceted** graphic: a unit graphic whose encoding uses the `row`, `column`, or `facet` channels.

Hosts MAY implement AIRMark rendering however they choose — a bespoke renderer, or compilation to an existing chart runtime — provided the observable behavior matches this section and the security requirements in §15 hold. The document itself remains pure AIRMark regardless of the rendering backend.

### 10.1 Rendering contract

The renderer MUST bind the component's dataset rows to the graphic as a named runtime datasource called `airspecData`; the `graphic` object itself never carries data. Resolution order for visual settings:

```text
Host security overrides
    ↓ (wins over)
Host / tenant theme
    ↓
Document theme (§12)
    ↓
graphic properties
    ↓
Renderer defaults
```

Security and accessibility overrides always win.

### 10.2 Prohibited — validators MUST reject the document if present anywhere in `graphic`

* Any data-source property: inline values, URLs, named external datasets, loaders, sequences, or generators.
* Any expression string, formula, template, script, or code-valued property, under any property name.
* Any URL-valued property: hyperlinks, image references, external fonts, remote schemas.
* Any transform not allowlisted in §10.4, and any filter written as a string rather than a structured predicate.
* Geographic shapes and projections (Level AV Hosts MAY explicitly allowlist these — §17).
* Custom formatter functions or locale-file references.
* Any property not defined by this section or a declared Host `x-` extension.

### 10.3 Marks

```
bar, line, area, point, circle, square, tick, rect, rule, text, arc, boxplot, errorband, errorbar
```

Mark definitions MAY be objects with visual properties only (e.g. `type`, `color`, `opacity`, `size`, `interpolate`, `cornerRadius*`, `point`, `tooltip: true`, `strokeDash`, `strokeWidth`, `filled`, `innerRadius`, `outerRadius`, `theta`). Property values MUST be JSON literals — never expression strings.

### 10.4 Transforms

Transforms are presentational reshaping steps applied to the injected rows only. `transform` is an ordered array of objects, each with a single discriminating key:

```
{ "aggregate": ... }      group and summarize rows
{ "bin": ... }            bucket a quantitative field
{ "timeUnit": ... }       truncate a temporal field to a unit
{ "stack": ... }          compute stacked positions
{ "window": ... }         running / ranked calculations over a sorted frame
{ "fold": ... }           columns → key/value rows
{ "flatten": ... }        expand array-valued fields to rows
{ "pivot": ... }          key/value rows → columns
{ "filter": ... }         keep rows matching a structured predicate
```

`filter` accepts **structured predicates only** — never a string:

```json
{ "filter": { "field": "revenue", "gt": 0 } }
{ "filter": { "and": [ { "field": "region", "oneOf": ["West", "East"] }, { "field": "revenue", "range": [0, 100000] } ] } }
```

Predicate comparators: `equal`, `oneOf`, `range`, `lt`, `lte`, `gt`, `gte`, `valid`, combinable with `and` / `or` / `not` to a nesting depth of 3.

Generators SHOULD perform aggregation in the Dataset (§7.3) and reserve `graphic` transforms for presentational reshaping.

### 10.5 Encoding channels

```
x, y, x2, y2, xOffset, yOffset,
color, fill, stroke, opacity, fillOpacity, strokeOpacity,
size, shape, angle, theta, theta2, radius, radius2,
strokeDash, strokeWidth, text, tooltip, detail, order,
row, column, facet
```

Each channel definition MAY include: `field`, `type` (`quantitative` | `temporal` | `ordinal` | `nominal`), `aggregate` (the metric operation names from §7.3), `bin`, `timeUnit`, `sort`, `stack`, `title`, `axis`, `legend`, `scale`, `format` (a §11 format object), and `condition` **only** in the selection-driven form of §10.8.

`field` values MUST reference columns present in the bound dataset's output. Validators MUST verify this (§14, Layer 2).

### 10.6 Axes, legends, scales

* `axis` and `legend` objects MAY set `title`, `labelAngle`, `labelLimit`, `labelOverlap`, `orient`, `grid`, `ticks`, `tickCount`, and `format` (a §11 format object). All values are JSON literals.
* `scale` MAY set `type` (`linear`, `log`, `sqrt`, `pow`, `time`, `utc`, `ordinal`, `band`, `point`), `domain` (literal arrays only), `range` (color arrays or named schemes from the Host palette registry), `zero`, `nice`, `padding`, `scheme`, and `reverse`.
* All formatting flows through §11 format objects; AIRMark has no string-pattern mini-language of its own and no formatter callbacks.

For positional channels, `axis.orient` selects the plot edge on which the axis is rendered: `left` or `right` for a y axis, and `bottom` or `top` for an x axis. An orientation incompatible with the channel MUST be rejected rather than silently ignored. On the nominal y axis of a horizontal chart, `right` moves the axis line, outward ticks, labels, and title to the plot's right edge. This is the center-spine label pattern for the left half of a mirrored pair.

`reverse` is a boolean with default `false`. It flips the scale's pixel range **after** all domain, sort, and tick computation. The domain, tick values, and labels are identical to the non-reversed scale; only positions mirror. On quantitative and log scales, values increase toward the opposite edge, and a bar chart's zero baseline moves to the flipped side automatically. On band and ordinal scales, `reverse` reverses the **resolved** domain order: apply `sort`, then reverse, so it composes with sort rather than replacing it.

The primary use is a diverging chart pair. A population pyramid uses two horizontal bar charts in adjacent grid cells with `scale: {"reverse": true}` on the left chart's quantitative channel. Both quantitative channels MUST declare the same explicit domain so bar lengths remain comparable across the spine. Category labels MAY remain on the outer left by using the left chart's default nominal axis and setting the right chart's nominal axis to `null`; alternatively, `axis: {"orient": "right"}` on the left chart places labels at the center spine.

### 10.7 Composition

* `layers` MAY contain up to the Host's `maxLayerCount` (RECOMMENDED default 4) unit graphics, each individually conforming to this grammar and sharing the same bound dataset.
* `facet` / `row` / `column` MAY be used; total facet cell count is clamped by the Host (RECOMMENDED default ≤ 24).
* Side-by-side chart arrangements are NOT part of AIRMark; use the document layout grid (§8) to place multiple chart components instead.

### 10.8 Selections and interactivity

A unit graphic MAY declare selections:

```json
{ "selections": [ { "id": "picked", "type": "point", "on": "click", "fields": ["region"] } ] }
```

* `type` is `point` (discrete marks) or `interval` (brushed range).
* Selections may drive `condition` encodings within the same chart: `{ "condition": { "selection": "picked", "value": "#3264D6" }, "value": "#C7CDD8" }`.
* Selections MUST NOT bind to external page elements, reference other components, or carry expressions.
* Cross-component behavior MUST use document Interactions (§13), never in-chart mechanisms.

### 10.9 Size and complexity limits

The Host MUST clamp `width`/`height` to its maximums and MUST cap injected rows at `maxChartRows` (§16). Validators SHOULD reject `graphic` objects exceeding a serialized size limit (RECOMMENDED 32 KB).

---

## 11. Formatting

A shared `format` object is used by metrics, tables, and tooltips:

```json
{ "type": "number",   "maximumFractionDigits": 1, "notation": "compact" }
{ "type": "currency", "currency": "USD", "maximumFractionDigits": 0 }
{ "type": "percent",  "maximumFractionDigits": 1 }
{ "type": "date",     "pattern": "MMM d, yyyy" }
{ "type": "datetime", "pattern": "MMM d, yyyy h:mm a" }
{ "type": "duration", "unit": "seconds", "style": "narrow" }
{ "type": "text" }
{ "type": "badge",    "map": { "Open": "warning", "Closed": "emphasisPositive" } }
```

* `pattern` uses Unicode date-format tokens; Hosts MUST render patterns via a formatting library, never by evaluating the pattern.
* Currency codes MUST be ISO 4217.
* `badge.map` maps field values to the fixed style token set from §9.4.

---

## 12. Theming

The document `theme` expresses report-level preferences. It is advisory: Host and tenant themes, plus accessibility and security overrides, take precedence per the resolution order in §10.1.

```json
{
  "theme": {
    "density": "comfortable",
    "palette": ["#3264D6", "#26A69A", "#F59E0B", "#DC5A5A"],
    "numberLocale": "en-US",
    "chart": {
      "legendOrient": "bottom",
      "gridLines": true,
      "fontScale": 1.0
    }
  }
}
```

* `density`: `compact` | `comfortable` | `spacious`.
* `palette`: 1–12 hex colors (`^#[0-9A-Fa-f]{6}$`). Hosts MAY replace colors failing contrast requirements.
* Fonts are Host-controlled; documents MUST NOT reference font files or external font names outside the Host registry.

---

## 13. Interactions and Actions

Interactions connect an event on one component to one or more approved actions, declared at the document level.

```json
{
  "id": "drillToRegion",
  "on": { "component": "revenueChart", "event": "select" },
  "action": {
    "type": "setParameter",
    "parameter": "region",
    "valueFrom": { "field": "region" }
  }
}
```

### 13.1 Events

`select` (chart mark or interval selection), `selectionClear` (a chart selection is cleared), `rowClick` (table row), `click` (metric/text), `change` (parameter control).

For `select` and `selectionClear`, `on.selection` SHOULD identify the selection declared in the source graphic. If the graphic declares more than one selection, `on.selection` is REQUIRED.

### 13.2 Actions

| Type | Payload | Notes |
| --- | --- | --- |
| `setParameter` | `parameter`, `value` or `valueFrom.field` | Re-executes dependent datasets. |
| `clearParameter` | `parameter` | |
| `navigate` | `route`, `params` map of literals or `{ "field": ... }` | `route` MUST be a Host-registered route ID. **Never a URL.** |
| `openDetail` | `source`, `recordIdFrom.field` | Opens the Host's trusted detail surface. |
| `export` | `datasetId`, `format: "csv" \| "xlsx"` | Executed via the Data Broker with viewer authorization. |
| `refresh` | optional `datasetIds` | |

AIRspec 1.1 `valueFrom` supports three transfer modes:

```json
{ "field": "region", "mode": "scalar" }
{ "field": "region", "mode": "values" }
{ "field": "created_at", "mode": "range" }
```

`scalar` is the default and transfers one value. `values` transfers de-duplicated selected values as an array and MUST target a compatible `multiSelect` parameter. `range` transfers `{ "start": ..., "end": ... }` from an interval selection and MUST target a compatible date-range or Host-declared numeric-range parameter. The event payload, selected field, transfer mode, and target parameter MUST be type-compatible.

An Interaction MUST declare exactly one of the legacy `action` property or an AIRspec 1.1 `actions` array of one to eight Actions:

```json
{
  "id": "drillAndRefresh",
  "on": {
    "component": "salesChart",
    "event": "select",
    "selection": "pickedRegion"
  },
  "actions": [
    {
      "type": "setParameter",
      "parameter": "region",
      "valueFrom": { "field": "region", "mode": "scalar" }
    },
    { "type": "clearParameter", "parameter": "account" },
    { "type": "refresh", "datasetIds": ["accountDetails"] }
  ]
}
```

Every `setParameter` action MUST declare exactly one of `value` or `valueFrom`. Hosts MUST validate all parameter mutations in an `actions` array before changing state, then commit those mutations atomically. Affected bindings and filters resolve after that single state commit, and each affected Dataset executes at most once for the new state revision. Non-state actions execute in declaration order after the state commit. A failed action MUST produce a component-scoped error and MUST NOT leave partially validated parameter state.

Hosts MUST derive reactive dependencies from filter parameter references, Dataset bindings, graphic bindings, visibility conditions, and interaction actions. Dataset cache keys MUST include every parameter affecting the resolved request plus viewer scope. Older asynchronous responses MUST NOT replace results from a newer state revision.

Hosts MUST validate that all referenced components, selections, parameters, datasets, fields, source IDs, and route IDs exist and are permitted. Documents MUST NOT express navigation as URLs under any property name.

---

## 14. Validation Layers

A document MUST pass every layer below before it is stored as a renderable version. Hosts SHOULD return machine-readable validation errors (with JSON Pointers) so Generators can self-correct.

| Layer | Name | Validates |
| --- | --- | --- |
| 1 | **Schema** | Structure against the AIRspec JSON Schema: required properties, types, enums, ID grammar, array caps, rejection of unknown non-`x-` properties. |
| 2 | **Semantic** | Sources exist; fields exist and permit the requested filter/sort/group/aggregate; every Dataset binding case is valid and covers its parameter options; stable output contracts satisfy all Components; component `datasetId`s resolve; parameter, selection, and interaction references resolve; transfer modes are type-compatible; IDs unique. |
| 3 | **Authorization** | Tenant/user may access every source, field, operation, and limit in every binding case; restricted fields absent; scopes applied; limits within authorization ceilings. Performed at generation **and re-checked for each resolved request at every execution**. |
| 4 | **AIRMark** | Every literal `graphic` and every `graphicBinding` case/default conforms to §10: allowlisted marks/transforms/channels, stable output fields only, no data/URL/expression surface, size and complexity caps. |
| 5 | **Runtime** | Binding resolution is deterministic; reactive work is coalesced per state revision; stale responses are discarded; Broker responses match the resolved dataset shape; row/size caps enforced; formatters receive type-compatible values; per-component error isolation. |

---

## 15. Security Requirements

These requirements are normative for every conformance class and MUST NOT be relaxed by extensions.

1. Documents are configuration. Hosts MUST NOT execute any document content as code and MUST NOT interpolate document strings into code, SQL, shell, or HTML without context-appropriate encoding.
2. Documents MUST NOT contain, and validators MUST reject: URLs to data or scripts, credentials, tokens, connection strings, raw SQL, raw HTML, expression strings, identifier-encoded formulas, or file paths. The closed structured arithmetic tree in §7.3 is data, not a string-expression language, and MUST be compiled only through allowlisted operators and catalog-mapped fields.
3. All data access flows through the Data Broker with server-held credentials and the *viewer's* authorization — never the author's, never the Generator's.
4. Execution requests reference stored immutable versions; clients MUST NOT submit or modify dataset definitions at execution time.
5. Tenant and account scoping are applied by the Broker independently of, and in addition to, any document filters. The Broker MUST NOT trust tenant/account identifiers appearing in a document.
6. The Generator MUST NOT receive credentials, raw endpoint addresses, unrestricted query access, or URL-fetching tools as part of report generation.
7. Errors surfaced to clients MUST NOT contain credentials, internal endpoint details, or stack traces.
8. Hosts MUST maintain an audit trail identifying who generated, published, and executed each document version.
9. Field-level redaction happens server-side: the Broker MUST strip fields the viewer may not receive, even if a stored document requests them.
10. Parameter switches select only among fully declared alternatives at the binding points defined by this specification. Hosts MUST NOT generalize them into expressions, templates, arbitrary property paths, JSON Patch, dynamic sources, or dynamic operations.

---

## 16. Limits

Hosts MUST enforce limits server-side and SHOULD supply them to the Generator in the generation context. RECOMMENDED defaults:

```json
{
  "maxDatasetsPerDocument": 12,
  "maxComponentsPerDocument": 40,
  "maxDepth": 8,
  "maxRowsPerDataset": 5000,
  "maxTablePageSize": 250,
  "maxChartRows": 10000,
  "maxLayerCount": 4,
  "maxFacetCells": 24,
  "maxGraphicBytes": 32768,
  "maxConcurrentDatasetRequests": 4,
  "datasetTimeoutMs": 30000
}
```

When a limit is exceeded at run time, the Broker SHOULD return a structured, user-presentable hint (e.g. "narrow the date range or aggregate") rather than a generic failure.

---

## 17. Conformance Classes

| Class | Name | Requirements |
| --- | --- | --- |
| **A** | Core | §3–§9 with `stack`, `grid`, `heading`, `text`, `metric`, `table`, `filterBar`; datasets `list` + `aggregate`; validation Layers 1–3, 5; all of §15. |
| **AV** | Core + Visualization | Class A plus the full AIRMark grammar (§10) and Layer 4. AV Hosts MAY additionally allowlist geographic marks and other documented capability extensions. |
| **AVI** | Interactive | Class AV plus Interactions (§13). |

A Generator conforms if every document it emits validates against the target Host's declared class, catalog, and limits.

---

## 18. Complete Example Document

```json
{
  "airspec": "1.1",
  "meta": {
    "title": "Sales Overview",
    "description": "Revenue and order activity for the selected period."
  },
  "parameters": [
    {
      "id": "dateRange",
      "type": "dateRange",
      "label": "Date Range",
      "required": true,
      "default": { "relative": "last90Days" }
    },
    {
      "id": "region",
      "type": "multiSelect",
      "label": "Region",
      "options": { "type": "fieldValues", "source": "orders", "field": "region" }
    },
    {
      "id": "sortMode",
      "type": "select",
      "label": "Chart order",
      "default": "chronological",
      "options": {
        "type": "static",
        "values": [
          { "value": "chronological", "label": "Chronological" },
          { "value": "highestRevenue", "label": "Highest revenue" }
        ]
      }
    }
  ],
  "datasets": [
    {
      "id": "totals",
      "source": "orders",
      "operation": "aggregate",
      "filters": [
        { "field": "created_at", "operator": "between", "parameter": "dateRange" },
        { "field": "region", "operator": "in", "parameter": "region" }
      ],
      "metrics": [
        { "operation": "sum", "field": "total", "alias": "revenue" },
        { "operation": "count", "alias": "orderCount" }
      ]
    },
    {
      "id": "revenueByMonth",
      "source": "orders",
      "operation": "aggregate",
      "filters": [
        { "field": "created_at", "operator": "between", "parameter": "dateRange" },
        { "field": "region", "operator": "in", "parameter": "region" }
      ],
      "dimensions": [
        { "field": "created_at", "timeUnit": "month", "alias": "month" },
        { "field": "region", "alias": "region" }
      ],
      "metrics": [
        { "operation": "sum", "field": "total", "alias": "revenue" }
      ],
      "bindings": {
        "sort": {
          "parameter": "sortMode",
          "cases": [
            {
              "equals": "chronological",
              "value": [{ "field": "month", "direction": "ascending" }]
            },
            {
              "equals": "highestRevenue",
              "value": [{ "field": "revenue", "direction": "descending" }]
            }
          ],
          "default": [{ "field": "month", "direction": "ascending" }]
        }
      }
    },
    {
      "id": "orderDetails",
      "source": "orders",
      "operation": "list",
      "fields": ["order_id", "created_at", "region", "status", "total"],
      "filters": [
        { "field": "created_at", "operator": "between", "parameter": "dateRange" },
        { "field": "region", "operator": "in", "parameter": "region" }
      ],
      "sort": [{ "field": "created_at", "direction": "descending" }],
      "pagination": { "pageSize": 50 }
    }
  ],
  "layout": {
    "id": "root",
    "type": "stack",
    "gap": "medium",
    "children": [
      { "id": "filters", "type": "filterBar", "parameters": ["dateRange", "region", "sortMode"] },
      {
        "id": "summary",
        "type": "grid",
        "gap": "medium",
        "children": [
          {
            "id": "revenueMetric",
            "type": "metric",
            "datasetId": "totals",
            "title": "Revenue",
            "valueField": "revenue",
            "format": { "type": "currency", "currency": "USD", "maximumFractionDigits": 0 },
            "grid": { "span": 3 }
          },
          {
            "id": "orderCountMetric",
            "type": "metric",
            "datasetId": "totals",
            "title": "Orders",
            "valueField": "orderCount",
            "format": { "type": "number", "maximumFractionDigits": 0 },
            "grid": { "span": 3 }
          },
          {
            "id": "revenueChart",
            "type": "chart",
            "datasetId": "revenueByMonth",
            "title": "Revenue by Month",
            "grid": { "span": 6, "minHeight": 320 },
            "graphic": {
              "mark": { "type": "line", "point": true, "interpolate": "monotone" },
              "encoding": {
                "x": { "field": "month", "type": "temporal", "title": "Month" },
                "y": {
                  "field": "revenue",
                  "type": "quantitative",
                  "title": "Revenue",
                  "axis": { "format": { "type": "currency", "currency": "USD", "maximumFractionDigits": 0 } }
                },
                "color": { "field": "region", "type": "nominal", "title": "Region" },
                "tooltip": [
                  { "field": "month", "type": "temporal", "title": "Month" },
                  { "field": "region", "type": "nominal", "title": "Region" },
                  { "field": "revenue", "type": "quantitative", "title": "Revenue", "format": { "type": "currency", "currency": "USD" } }
                ]
              },
              "config": { "view": { "stroke": null } }
            }
          }
        ]
      },
      {
        "id": "orderTable",
        "type": "table",
        "datasetId": "orderDetails",
        "title": "Order Details",
        "columns": [
          { "field": "order_id", "label": "Order #", "sortable": true },
          { "field": "created_at", "label": "Created", "format": { "type": "date", "pattern": "MMM d, yyyy" }, "sortable": true },
          { "field": "region", "label": "Region", "sortable": true },
          { "field": "status", "label": "Status", "format": { "type": "badge", "map": { "Open": "warning", "Closed": "emphasisPositive" } } },
          { "field": "total", "label": "Total", "align": "right", "format": { "type": "currency", "currency": "USD" }, "sortable": true }
        ],
        "pagination": { "enabled": true, "pageSize": 50 },
        "grid": { "span": 12 }
      }
    ]
  },
  "theme": {
    "density": "comfortable",
    "palette": ["#3264D6", "#26A69A", "#F59E0B", "#DC5A5A"]
  },
  "interactions": [
    {
      "id": "chartToRegionFilter",
      "on": { "component": "revenueChart", "event": "select" },
      "action": { "type": "setParameter", "parameter": "region", "valueFrom": { "field": "region" } }
    }
  ]
}
```

---

## Appendix A: Reserved Property Names

The following names are reserved at all levels for future versions and MUST NOT be used as extension or alias names: `airspec`, `meta`, `data`, `signal`, `script`, `html`, `url`, `href`, `sql`, `credentials`, `token`.

---

## Appendix B: JSON Schema Skeleton

Implementers SHOULD publish a full JSON Schema at the ID convention in the header. Skeleton:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://airspec.dev/schema/1.1/airspec.schema.json",
  "title": "AIRspec Document",
  "type": "object",
  "required": ["airspec", "meta", "datasets", "layout"],
  "additionalProperties": false,
  "properties": {
    "airspec": { "const": "1.1" },
    "meta": {
      "type": "object",
      "required": ["title"],
      "properties": {
        "title": { "type": "string", "maxLength": 200 },
        "description": { "type": "string", "maxLength": 2000 },
        "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 20 }
      },
      "patternProperties": { "^x-": {} },
      "additionalProperties": false
    },
    "parameters": { "type": "array", "items": { "$ref": "#/$defs/parameter" }, "maxItems": 25 },
    "datasets": { "type": "array", "items": { "$ref": "#/$defs/dataset" }, "maxItems": 12 },
    "layout": { "$ref": "#/$defs/component" },
    "theme": { "$ref": "#/$defs/theme" },
    "interactions": { "type": "array", "items": { "$ref": "#/$defs/interaction" }, "maxItems": 20 }
  },
  "patternProperties": { "^x-": {} },
  "$defs": {
    "id": { "type": "string", "pattern": "^[a-zA-Z][a-zA-Z0-9_-]{0,63}$" },
    "fieldRef": { "type": "string", "pattern": "^[a-zA-Z][a-zA-Z0-9_.]{0,127}$" },
    "parameter": { "...": "see §5" },
    "dataset": { "...": "see §7" },
    "component": { "...": "discriminated union on type, see §8–§9" },
    "graphic": { "...": "AIRMark grammar constraints, see §10" },
    "theme": { "...": "see §12" },
    "interaction": { "...": "see §13" }
  }
}
```

---

## Acknowledgments

AIRMark's mark/encoding design draws on the grammar-of-graphics tradition, and [Vega-Lite](https://vega.github.io/vega-lite/) — a well-established open visualization standard — served as a valuable reference point during AIRspec's design. AIRMark is an independent grammar defined entirely by §10 of this specification: conformance is measured against this document alone, and no external grammar, schema, or runtime is required or implied. Hosts are free to implement AIRMark rendering with any charting technology.

---

*AIRspec — declare the report, trust the host.*

---

## Changelog

### airmark-engine 0.4.5

- **Deterministic formatted tooltips.** Tooltip encoding channels (§10.5) now produce deterministic, format-aware tooltip entries. Each `tooltip` channel definition's `format` object (§11) is applied to the bound datum value, producing stable `label: value` pairs regardless of host locale or runtime state.
- **Native React/SVG `<title>` tooltips.** The React renderer emits native SVG `<title>` elements for each mark with tooltip metadata. Hovering a mark shows a browser-native tooltip with all formatted tooltip fields — no JavaScript tooltip library, no custom positioning, no z-index conflicts. Accessible by default (screen readers announce `title` content).
- **Optional React `transitionMs`.** `AirmarkChart` and `AirmarkChartAuto` accept an optional `transitionMs` prop (milliseconds, default `0`). When non-zero, marks animate between data states via CSS geometry transitions (rects, circles, opacity/fill morph; axis text crossfades; paths/lines snap). The scene graph remains deterministic and conformance-relevant; only the on-screen interpolation between two exact layouts is smoothed. Requires stable mark identity across states.
- **Tooltip-enabled donut fixture.** The `arc-donut` conformance fixture now includes `tooltip` encoding channels, and a new `arc-pie-legend-tooltip` fixture demonstrates tooltip + legend interaction. Gallery tag added.
- **AIRspec generator guidance updated.** Generator documentation recommends declaring `tooltip` channels on all data-bound marks to ensure hover-readable charts. See §10.5 and the example in §18.
- **31 tests and 17 goldens pass.** Full conformance suite green.
- **GitHub release:** https://github.com/bzalk/airmark-engine/releases/tag/v0.4.5
