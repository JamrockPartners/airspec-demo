import { supabase, callEdgeFunction } from './api';
import type { DataSource, DataSourceField } from '../types/airspec';

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_+$/g, '');
  if (!base) return 'ds_source';
  if (/^[0-9]/.test(base)) return `ds_${base}`;
  return base;
}

export async function getDataSources(): Promise<DataSource[]> {
  const { data, error } = await supabase
    .from('airspec_data_sources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEnabledDataSources(): Promise<DataSource[]> {
  const { data, error } = await supabase
    .from('airspec_data_sources')
    .select('*')
    .eq('enabled', true)
    .order('name');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDataSourceById(id: string): Promise<DataSource | null> {
  const { data, error } = await supabase
    .from('airspec_data_sources')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createDataSource(params: {
  name: string;
  description?: string;
  source_type: 'csv' | 'json' | 'inline' | 'api';
  fields_json: DataSourceField[];
  constraints_json?: Record<string, unknown>;
  row_count?: number;
  api_url?: string | null;
  api_format?: 'json' | 'csv' | null;
  api_root_path?: string | null;
}): Promise<DataSource> {
  const { data, error } = await supabase
    .from('airspec_data_sources')
    .insert({
      slug: slugify(params.name),
      name: params.name,
      description: params.description ?? null,
      source_type: params.source_type,
      fields_json: params.fields_json,
      constraints_json: params.constraints_json ?? {},
      row_count: params.row_count ?? 0,
      api_url: params.api_url ?? null,
      api_format: params.api_format ?? null,
      api_root_path: params.api_root_path ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateDataSource(
  id: string,
  updates: Partial<Pick<DataSource, 'name' | 'description' | 'enabled' | 'fields_json' | 'constraints_json'>>
): Promise<DataSource> {
  const { data, error } = await supabase
    .from('airspec_data_sources')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function toggleDataSourceEnabled(id: string, enabled: boolean): Promise<DataSource> {
  return updateDataSource(id, { enabled });
}

export async function deleteDataSource(id: string): Promise<void> {
  const { error } = await supabase
    .from('airspec_data_sources')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function uploadDatasetRows(
  dataSourceId: string,
  rows: Record<string, unknown>[],
  fieldMapping?: { name: string; key: string }[]
): Promise<void> {
  // Delete existing rows for this source first
  const { error: deleteError } = await supabase
    .from('airspec_dataset_rows')
    .delete()
    .eq('data_source_id', dataSourceId);

  if (deleteError) throw new Error(deleteError.message);

  // Remap row properties from original column names to keys
  const mappedRows = fieldMapping
    ? rows.map((row) => {
        const mapped: Record<string, unknown> = {};
        for (const { name, key } of fieldMapping) {
          if (name in row) mapped[key] = row[name];
        }
        return mapped;
      })
    : rows;

  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < mappedRows.length; i += batchSize) {
    const batch = mappedRows.slice(i, i + batchSize).map((row) => ({
      data_source_id: dataSourceId,
      row_data: row,
    }));

    const { error } = await supabase
      .from('airspec_dataset_rows')
      .insert(batch);

    if (error) throw new Error(error.message);
  }

  // Update row count on the source
  await supabase
    .from('airspec_data_sources')
    .update({ row_count: mappedRows.length, updated_at: new Date().toISOString() })
    .eq('id', dataSourceId);
}

export async function getDatasetRows(
  dataSourceId: string,
  limit = 1000
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('airspec_dataset_rows')
    .select('row_data')
    .eq('data_source_id', dataSourceId)
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.row_data as Record<string, unknown>);
}

export interface ApiSampleResult {
  rows: Record<string, unknown>[];
  totalRows: number;
  truncated: boolean;
  format: 'json' | 'csv';
  rootPath: string | null;
  fields: DataSourceField[];
}

export async function fetchApiSample(params: {
  url: string;
  format?: 'json' | 'csv' | null;
  rootPath?: string | null;
}): Promise<ApiSampleResult> {
  const result = await callEdgeFunction<ApiSampleResult>('airspec-api-fetch', {
    url: params.url,
    format: params.format ?? undefined,
    rootPath: params.rootPath ?? undefined,
  });
  return result;
}

export async function previewApiDataSource(
  dataSourceId: string
): Promise<ApiSampleResult> {
  const source = await getDataSourceById(dataSourceId);
  if (!source) throw new Error('Data source not found');
  if (source.source_type !== 'api' || !source.api_url) {
    throw new Error('This data source is not a live API source');
  }
  return fetchApiSample({
    url: source.api_url,
    format: source.api_format,
    rootPath: source.api_root_path,
  });
}
