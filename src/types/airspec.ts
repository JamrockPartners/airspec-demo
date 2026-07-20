export interface DataSourceField {
  name: string;
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  description?: string;
}

export interface DataSource {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  source_type: 'csv' | 'json' | 'inline' | 'api';
  fields_json: DataSourceField[];
  constraints_json: Record<string, unknown>;
  enabled: boolean;
  row_count: number;
  api_url: string | null;
  api_format: 'json' | 'csv' | null;
  api_root_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  name: string;
  description: string | null;
  current_version_id: string | null;
  session_id: string | null;
  model: string | null;
  account_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ReportVersion {
  id: string;
  report_id: string;
  version_number: number;
  schema_version: string;
  user_prompt: string | null;
  report_spec_json: AirspecDocument | null;
  generation_model: string | null;
  generation_metadata_json: Record<string, unknown> | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_errors_json: string[] | null;
  created_at: string;
}

export interface ChatImageAttachment {
  id: string;
  path: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface ChatMessage {
  id?: string;
  session_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatImageAttachment[];
  created_at?: string;
}

// ---------------------------------------------------------------------------
// AIRspec 1.1 Document Types
// Mirrors https://airspec.dev/schema/1.1/airspec.schema.json
// ---------------------------------------------------------------------------

export interface AirspecDocument {
  airspec: '1.1';
  meta: { title: string; description?: string; tags?: string[] };
  parameters?: AirspecParameter[];
  datasets: AirspecDataset[];
  layout: AirspecComponent;
  theme?: AirspecTheme;
  interactions?: AirspecInteraction[];
}

export type AirspecParameterType =
  | 'text' | 'number' | 'boolean' | 'date' | 'dateRange' | 'select' | 'multiSelect';

export interface AirspecParameter {
  id: string;
  type: AirspecParameterType;
  label: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  default?: unknown;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: AirspecParameterOptions;
}

export type AirspecParameterOptions =
  | { type: 'static'; values: { value: string | number | boolean; label: string }[] }
  | { type: 'fieldValues'; source: string; field: string };

export type AirspecFilterOperator =
  | 'equals' | 'notEquals' | 'in' | 'notIn' | 'contains' | 'startsWith' | 'endsWith'
  | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual'
  | 'between' | 'isNull' | 'isNotNull' | 'isTrue' | 'isFalse';

export type AirspecFilter = AirspecFieldFilter | AirspecFilterGroup;

export interface AirspecFieldFilter {
  field: string;
  operator: AirspecFilterOperator;
  value?: unknown;
  parameter?: string;
}

export interface AirspecFilterGroup {
  boolean: 'and' | 'or';
  filters: AirspecFilter[];
}

export interface AirspecSort {
  field: string;
  direction: 'ascending' | 'descending';
}

export interface AirspecDimension {
  field: string;
  timeUnit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  alias?: string;
}

export type AirspecMetricOperation =
  | 'count' | 'countDistinct' | 'sum' | 'average' | 'minimum' | 'maximum' | 'median';

export interface AirspecMetric {
  operation: AirspecMetricOperation;
  field?: string;
  alias?: string;
}

export type AirspecDatasetBindings = {
  fields?: AirspecBinding<string[]>;
  field?: AirspecBinding<string>;
  dimensions?: AirspecBinding<AirspecDimension[]>;
  metrics?: AirspecBinding<AirspecMetric[]>;
  filters?: AirspecBinding<AirspecFilter[]>;
  sort?: AirspecBinding<AirspecSort[]>;
  limit?: AirspecBinding<number>;
};

export interface AirspecBinding<T> {
  parameter: string;
  cases: { equals: string | number | boolean; value: T }[];
  default: T;
}

export interface AirspecDataset {
  id: string;
  source: string;
  operation: 'list' | 'aggregate' | 'distinct';
  fields?: string[];
  field?: string;
  dimensions?: AirspecDimension[];
  metrics?: AirspecMetric[];
  filters?: AirspecFilter[];
  sort?: AirspecSort[];
  limit?: number;
  bindings?: AirspecDatasetBindings;
  pagination?: { pageSize?: number };
}

export interface AirspecFormat {
  type: 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'duration' | 'text' | 'badge';
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  notation?: 'standard' | 'compact';
  currency?: string;
  pattern?: string;
  unit?: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
  style?: 'narrow' | 'short' | 'long';
  map?: Record<string, AirspecStyleToken>;
}

export type AirspecStyleToken =
  | 'emphasisPositive' | 'emphasisNegative' | 'emphasisNeutral' | 'muted' | 'warning';

export interface AirspecGridPlacement {
  span?: number;
  spanTablet?: number;
  spanMobile?: number;
  minHeight?: number;
  maxHeight?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface AirspecVisibleWhen {
  parameter: string;
  operator: AirspecFilterOperator;
  value?: unknown;
}

export type AirspecComponentType =
  | 'stack' | 'grid' | 'section' | 'heading' | 'text' | 'divider' | 'metric'
  | 'table' | 'chart' | 'filterBar' | 'emptyState' | string; // extension: ^x-

export interface AirspecComponentBase {
  id: string;
  type: AirspecComponentType;
  title?: string;
  visibleWhen?: AirspecVisibleWhen;
  grid?: AirspecGridPlacement;
}

export interface AirspecContainerComponent extends AirspecComponentBase {
  type: 'stack' | 'grid' | 'section';
  gap?: 'none' | 'small' | 'medium' | 'large';
  description?: string;
  collapsible?: boolean;
  children: AirspecComponent[];
}

export interface AirspecHeadingComponent extends AirspecComponentBase {
  type: 'heading';
  text: string;
  level?: 1 | 2 | 3 | 4;
}

export interface AirspecTextComponent extends AirspecComponentBase {
  type: 'text';
  text: string;
}

export interface AirspecDividerComponent extends AirspecComponentBase {
  type: 'divider';
}

export interface AirspecMetricComponent extends AirspecComponentBase {
  type: 'metric';
  datasetId: string;
  valueField: string;
  format?: AirspecFormat;
  subtitle?: string;
  icon?: string;
  prefix?: string;
  suffix?: string;
  comparison?: {
    valueField: string;
    display?: 'percentChange' | 'difference' | 'raw';
    positiveIs?: 'good' | 'bad' | 'neutral';
  };
}

export interface AirspecTableComponent extends AirspecComponentBase {
  type: 'table';
  datasetId: string;
  columns: {
    field: string;
    label?: string;
    format?: AirspecFormat;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    width?: number;
    conditional?: { operator: AirspecFilterOperator; value?: unknown; style: AirspecStyleToken }[];
  }[];
  pagination?: { enabled?: boolean; pageSize?: number };
  totals?: { enabled?: boolean; fields?: string[] };
}

export interface AirspecFilterBarComponent extends AirspecComponentBase {
  type: 'filterBar';
  parameters: string[];
}

export interface AirspecEmptyStateComponent extends AirspecComponentBase {
  type: 'emptyState';
  datasetId: string;
  message: string;
  icon?: string;
}

export interface AirspecChartComponent extends AirspecComponentBase {
  type: 'chart';
  datasetId: string;
  graphic?: AirspecGraphic;
  graphicBinding?: AirspecBinding<AirspecGraphic>;
}

// AIRMark graphic grammar -----------------------------------------------------

export type AirspecGraphic = AirspecUnitGraphic | AirspecLayeredGraphic;

export interface AirspecUnitGraphic {
  mark: AirspecMark;
  encoding: AirspecEncoding;
  transform?: AirspecGraphicTransform[];
  selections?: AirspecSelection[];
  width?: number;
  height?: number;
  config?: AirspecGraphicConfig;
}

export interface AirspecLayeredGraphic {
  layers: AirspecUnitGraphic[];
  width?: number;
  height?: number;
  config?: AirspecGraphicConfig;
}

export type AirspecMark =
  | AirspecMarkType
  | {
      type: AirspecMarkType;
      color?: string;
      opacity?: number;
      size?: number;
      interpolate?: 'linear' | 'monotone' | 'step' | 'step-before' | 'step-after' | 'basis' | 'cardinal';
      point?: boolean;
      tooltip?: boolean;
      filled?: boolean;
      cornerRadius?: number;
      cornerRadiusEnd?: number;
      strokeWidth?: number;
      strokeDash?: number[];
      innerRadius?: number;
      outerRadius?: number;
    };

export type AirspecMarkType =
  | 'bar' | 'line' | 'area' | 'point' | 'circle' | 'square' | 'tick' | 'rect'
  | 'rule' | 'text' | 'arc' | 'boxplot' | 'errorband' | 'errorbar';

export type AirspecChannelType = 'quantitative' | 'temporal' | 'ordinal' | 'nominal';

export interface AirspecChannel {
  field?: string;
  type?: AirspecChannelType;
  aggregate?: AirspecMetricOperation;
  bin?: boolean | { maxbins?: number; step?: number };
  timeUnit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  sort?: 'ascending' | 'descending' | 'x' | 'y' | '-x' | '-y' | null | (string | number)[];
  stack?: 'zero' | 'normalize' | 'center' | null;
  title?: string | null;
  axis?: AirspecAxis | null;
  legend?: AirspecLegend | null;
  scale?: AirspecScale;
  format?: AirspecFormat;
  value?: unknown;
  condition?: { selection: string; value?: unknown; field?: string; type?: AirspecChannelType };
}

export interface AirspecAxis {
  title?: string | null;
  labelAngle?: number;
  labelLimit?: number;
  labelOverlap?: boolean | string;
  orient?: 'top' | 'bottom' | 'left' | 'right';
  grid?: boolean;
  ticks?: boolean;
  tickCount?: number;
  format?: AirspecFormat;
}

export interface AirspecLegend {
  title?: string | null;
  orient?: 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  format?: AirspecFormat;
}

export interface AirspecScale {
  type?: 'linear' | 'log' | 'sqrt' | 'pow' | 'time' | 'utc' | 'ordinal' | 'band' | 'point';
  domain?: unknown[];
  range?: string[];
  scheme?: string;
  zero?: boolean;
  nice?: boolean;
  padding?: number;
}

export interface AirspecGraphicTransform {
  aggregate?: { op: AirspecMetricOperation; field?: string; as: string }[];
  groupby?: string[];
  bin?: { field: string; as: string; maxbins?: number };
  timeUnit?: { field: string; unit: 'day' | 'week' | 'month' | 'quarter' | 'year'; as: string };
  stack?: {
    field: string;
    groupby: string[];
    as: [string, string];
    offset?: 'zero' | 'normalize' | 'center';
  };
  window?: {
    op: 'rank' | 'denseRank' | 'rowNumber' | 'sum' | 'average' | 'minimum' | 'maximum' | 'count';
    field?: string;
    as: string;
  }[];
  fold?: string[];
  flatten?: string[];
  pivot?: { field: string; value: string; groupby?: string[] };
  filter?: AirspecGraphicPredicate;
  sort?: AirspecSort[];
  as?: unknown;
}

export type AirspecGraphicPredicate =
  | {
      field: string;
      equal?: unknown;
      oneOf?: unknown[];
      range?: [unknown, unknown];
      lt?: unknown;
      lte?: unknown;
      gt?: unknown;
      gte?: unknown;
      valid?: boolean;
    }
  | { and: AirspecGraphicPredicate[] }
  | { or: AirspecGraphicPredicate[] }
  | { not: AirspecGraphicPredicate };

export interface AirspecSelection {
  id: string;
  type: 'point' | 'interval';
  on?: 'click' | 'mouseover';
  fields?: string[];
}

export interface AirspecGraphicConfig {
  view?: { stroke?: string | null };
  legend?: AirspecLegend;
}

export interface AirspecTheme {
  density?: 'compact' | 'comfortable' | 'spacious';
  palette?: string[];
  numberLocale?: string;
  chart?: {
    legendOrient?: 'left' | 'right' | 'top' | 'bottom';
    gridLines?: boolean;
    fontScale?: number;
  };
}

// Interactions ---------------------------------------------------------------

export type AirspecEvent = 'select' | 'selectionClear' | 'rowClick' | 'click' | 'change';

export interface AirspecInteractionOn {
  component: string;
  event: AirspecEvent;
  selection?: string;
}

export type AirspecAction =
  | { type: 'setParameter'; parameter: string; value?: unknown; valueFrom?: { field: string; mode?: 'scalar' | 'values' | 'range' } }
  | { type: 'clearParameter'; parameter: string }
  | { type: 'navigate'; route: string; params?: Record<string, unknown | { field: string }> }
  | { type: 'openDetail'; source: string; recordIdFrom: { field: string } }
  | { type: 'export'; datasetId: string; format: 'csv' | 'xlsx' }
  | { type: 'refresh'; datasetIds?: string[] };

export interface AirspecInteraction {
  id: string;
  on: AirspecInteractionOn;
  action?: AirspecAction;
  actions?: AirspecAction[];
}

// Loose component type for the renderer (narrowed at the component level)
export interface AirspecComponent {
  id: string;
  type: AirspecComponentType;
  title?: string;
  visibleWhen?: AirspecVisibleWhen;
  grid?: AirspecGridPlacement;
  [key: string]: unknown;
}
