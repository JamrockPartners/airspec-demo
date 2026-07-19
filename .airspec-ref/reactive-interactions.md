# AIRspec 1.1 — Reactive Interactions Design

Status: incorporated into AIRspec 1.1 draft

## Problem

AIRspec 1.0 can bind parameter values to filters and can update a parameter from a component event. It cannot safely express structural choices such as changing a dataset sort, grouping, metric, field set, or chart grammar without duplicating datasets and components behind `visibleWhen` conditions. It also lacks atomic multi-action events and complete scalar, multi-value, and interval selection transfer.

AIRspec 1.1 adds a declarative reactive cycle:

```text
component or parameter event
  → validated state action(s)
  → parameter state changes atomically
  → affected dataset bindings resolve
  → affected datasets execute once
  → bound components render once
```

No binding evaluates an expression, interpolates a string, constructs a field name, or applies an arbitrary JSON patch. A parameter only selects one of the document's fully declared and independently valid alternatives.

## Use-case matrix

| Use case | Event/state input | Reactive target | AIRspec 1.1 mechanism | Required validation |
| --- | --- | --- | --- | --- |
| Ascending/descending sort | Static `select` parameter | Dataset `sort` | `dataset.bindings.sort` | Every case is a valid sort; fields exist and are sortable |
| Sort by different fields | Static `select` parameter | Dataset `sort` | `dataset.bindings.sort` | Every field/alias exists in the applicable dataset output |
| Slice/group by dimension | Static `select` parameter | Aggregate `dimensions` | `dataset.bindings.dimensions` | Every field is groupable; aliases preserve the component output contract |
| Change displayed metric | Static `select` parameter | Aggregate `metrics` | `dataset.bindings.metrics` | Every operation is catalog-approved; aliases preserve the output contract |
| Change time granularity | Static `select` parameter | Aggregate `dimensions` | `dataset.bindings.dimensions` | Every time unit is catalog-approved; output alias remains stable |
| Top-N | Static numeric `select` parameter | Dataset `limit` and usually `sort` | `dataset.bindings.limit` plus optional `bindings.sort` | Every limit is within catalog, policy, and Host ceilings |
| Switch a list's returned columns | Static `select` parameter | List `fields` | `dataset.bindings.fields` | Every field is permitted; all component-bound fields exist in every case |
| Switch a distinct-value field | Static `select` parameter | Distinct `field` | `dataset.bindings.field` | Every field is filterable and authorized |
| Switch a complete filter structure | Static `select` parameter | Dataset `filters` | `dataset.bindings.filters` | Every case is semantically and authorization valid |
| Filter from a control | Parameter change | Filter value | Existing `filter.parameter` | Parameter type is compatible with the operator and field |
| Cross-filter another chart | Chart selection | Parameter, then dependent filters | `setParameter` with `valueFrom`, then existing `filter.parameter` | Source field exists; transfer mode matches parameter type |
| Point drill-down | Mark selection | Parameter or registered route | `setParameter`, `navigate`, or `openDetail` | Component, selection, field, parameter, route, and source resolve |
| Interval drill-down | Brush selection | Date/number range parameter | `valueFrom.mode: "range"` | Selection is interval; field type matches range parameter |
| Multi-select marks | Point selection | `multiSelect` parameter | `valueFrom.mode: "values"` | Selection supports multiple values; target is `multiSelect` |
| Clear a cross-filter | Selection cleared or explicit control | Parameter | `selectionClear` plus `clearParameter` | Selection and parameter resolve |
| Set several drill-down values | One selection | Multiple parameters | `interaction.actions` | All state actions validate; state updates are atomic |
| Change chart type or encoding | Static `select` parameter | Chart `graphic` | `chart.graphicBinding` | Every case is a complete valid AIRMark graphic over the stable dataset output |
| Change stack/group presentation | Static `select` parameter | Chart `graphic` | `chart.graphicBinding` | Every graphic passes AIRMark and field checks |
| Show/hide explanatory content | Parameter state | Component visibility | Existing `visibleWhen` | Condition is type-compatible; never used for authorization |
| Refresh dependent data | Click/change/selection | Dataset cache | Existing `refresh`, optionally in `actions` | Dataset IDs resolve and are authorized |
| Export the current slice | Click | Broker export | Existing `export` | Export uses resolved parameter state and viewer authorization |
| Navigate from a selected record | Row/mark selection | Registered route | Existing `navigate` with field-derived params | Route and route params are catalog-registered; never a URL |
| One control affects many components | Parameter change | Multiple dependent datasets/graphics | Implicit dependency graph | Host resolves all bindings before executing; each dataset executes at most once per state revision |
| Many controls affect one dataset | Multiple parameter values | Multiple binding targets and filters | Independent typed bindings | No two bindings target the same property; resolution is deterministic |
| Loading, empty, error transitions | Any reactive update | Component state | Existing per-component runtime states | Previous state is not presented as current; failures remain isolated |

## Vocabulary

### 1. Parameter switch

A parameter switch is used only at an explicitly typed binding point:

```json
{
  "parameter": "sortMode",
  "cases": [
    { "equals": "frequency", "value": [{ "field": "frequency", "direction": "descending" }] },
    { "equals": "alphabetical", "value": [{ "field": "letter", "direction": "ascending" }] }
  ],
  "default": [{ "field": "frequency", "direction": "descending" }]
}
```

Rules:

* `parameter` MUST reference a `select` parameter with static options, or a boolean parameter.
* `equals` MUST be a literal static option value (or boolean), MUST be unique within the switch, and MUST be type-compatible with the parameter.
* `cases` MUST cover every static option value. `default` is REQUIRED and is used when the parameter is absent or cleared.
* Each `value` and `default` is validated using the ordinary schema and semantic rules for the property being bound.
* A switch replaces its target property; it does not merge, append, interpolate, or patch.

### 2. Dataset bindings

`dataset.bindings` exposes only approved logical-query seams:

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
        { "equals": "frequency", "value": [{ "field": "value", "direction": "descending" }] },
        { "equals": "alphabetical", "value": [{ "field": "category", "direction": "ascending" }] }
      ],
      "default": [{ "field": "value", "direction": "descending" }]
    }
  }
}
```

Allowed binding targets are `fields`, `field`, `dimensions`, `metrics`, `filters`, `sort`, and `limit`. `id`, `source`, `operation`, credentials, endpoints, and extension properties are never bindable. A dataset MUST NOT declare both a literal target property and a binding for that property.

For every possible resolved case, the dataset MUST be structurally, semantically, and authorization valid. Its **stable output contract** is the intersection of output field names produced by every case. Every component-bound field MUST be in that stable output contract. Structural alternatives SHOULD use stable aliases such as `category` and `value`.

### 3. Graphic binding

A chart may provide either a literal `graphic` or a `graphicBinding`:

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

Every graphic alternative MUST independently pass AIRMark validation and MAY reference only fields in the dataset's stable output contract. Graphics remain unable to carry data, URLs, expressions, or external runtime configuration.

### 4. Selection transfer modes

`valueFrom` gains an optional `mode`:

```json
{ "field": "region", "mode": "scalar" }
{ "field": "region", "mode": "values" }
{ "field": "created_at", "mode": "range" }
```

`scalar` is the default and transfers one selected value. `values` transfers the de-duplicated selected values as an array. `range` transfers `{ "start": ..., "end": ... }` from an interval selection. Hosts MUST validate event shape and target parameter compatibility before changing state.

### 5. Selection-qualified events and atomic actions

An interaction may identify the selection that produced a chart event, and may execute one legacy `action` or an `actions` array:

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

`selectionClear` is the corresponding event for a cleared point or interval selection. All parameter mutations in `actions` MUST be validated first and committed atomically. After the state commit, affected datasets execute at most once. Non-state actions run in declaration order after the state commit. A failed action MUST produce a component-scoped error and MUST NOT cause partially validated parameter state.

## Dependency and execution rules

* Hosts MUST derive dependencies from filter parameter references, dataset bindings, graphic bindings, visibility conditions, and interaction actions.
* Parameter changes form a new immutable state revision. Dataset cache keys MUST include every parameter that affects the resolved request plus viewer scope.
* All switches resolve before Layer-2 and Layer-3 checks and again before every execution. Stored documents do not bypass current authorization.
* A reactive update MUST coalesce affected work so each dataset executes at most once per state revision.
* Stale responses from an older state revision MUST NOT replace newer results.
* Binding resolution errors fail only dependent components and MUST be machine-readable.

## Explicit non-goals

AIRspec 1.1 does not add expressions, computed parameters, templates, arbitrary property paths, JSON Patch, scripts, client-supplied dataset definitions, dynamic sources, dynamic operations, or direct chart-runtime event handlers.
