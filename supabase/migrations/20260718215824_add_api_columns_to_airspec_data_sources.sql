/*
# Add API source columns to airspec_data_sources

## Purpose
Support "dynamic API" data sources that fetch live data from a remote
endpoint at render time instead of storing rows locally. Only the endpoint
configuration and field schema are persisted; rows are never stored.

## Changes
1. New columns on `airspec_data_sources`:
   - `api_url` (text, nullable) — the remote endpoint URL. NULL for
     csv/json/inline sources; required for api sources.
   - `api_format` (text, nullable) — 'json' or 'csv'. Describes the
     response body format. NULL for non-api sources.
   - `api_root_path` (text, nullable) — for JSON responses, a dotted path
     to the records array inside the response (e.g. 'departments').
     NULL means the response body itself is the array. Ignored for csv.

2. `source_type` now also accepts 'api'. For api sources, `row_count`
   stays 0 and no rows are written to `airspec_dataset_rows`.

## Security
- No RLS policy changes. Existing anon + authenticated policies remain in
  effect (single-tenant, no auth). The new columns carry only public
  endpoint URLs and field metadata, safe to read/write as anon.

## Notes
- All columns are nullable and additive, so existing csv/json/inline
  sources are unaffected.
- The data broker branches on source_type: api -> live fetch; others ->
  read from airspec_dataset_rows.
*/

ALTER TABLE airspec_data_sources
  ADD COLUMN IF NOT EXISTS api_url text;

ALTER TABLE airspec_data_sources
  ADD COLUMN IF NOT EXISTS api_format text CHECK (api_format IS NULL OR api_format IN ('json', 'csv'));

ALTER TABLE airspec_data_sources
  ADD COLUMN IF NOT EXISTS api_root_path text;