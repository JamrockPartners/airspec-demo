/*
# Create AIRspec Dynamic Reporting Tables

1. New Tables
   - `airspec_data_sources` - Dynamic data source catalog (replaces hardcoded config)
     - `id` (uuid, primary key)
     - `name` (text, not null) - Human-readable source name
     - `description` (text) - What this data source contains
     - `source_type` (text) - Type: 'csv', 'json', 'inline'
     - `fields_json` (jsonb) - Array of field definitions [{name, type, description}]
     - `constraints_json` (jsonb) - Max rows, page size, etc.
     - `enabled` (boolean) - Whether AI agents can use this source
     - `row_count` (integer) - Cached count of rows
     - `created_at` / `updated_at` (timestamptz)

   - `airspec_dataset_rows` - Stores actual data rows for each source
     - `id` (uuid, primary key)
     - `data_source_id` (uuid, FK to airspec_data_sources)
     - `row_data` (jsonb) - Single row of data as key-value pairs
     - `created_at` (timestamptz)

   - `airspec_reports` - Parent report records
     - `id` (uuid, primary key)
     - `name` (text, not null)
     - `description` (text)
     - `current_version_id` (uuid) - Points to active version
     - `account_id` (text) - Tenant isolation
     - `created_at` / `updated_at` (timestamptz)
     - `archived_at` (timestamptz) - Soft delete

   - `airspec_report_versions` - Immutable version snapshots
     - `id` (uuid, primary key)
     - `report_id` (uuid, FK to airspec_reports)
     - `version_number` (integer)
     - `schema_version` (text) - AIRspec version (default '1.0')
     - `user_prompt` (text) - Requirements that produced this version
     - `report_spec_json` (jsonb) - Full AIRspec document
     - `generation_model` (text) - Model used
     - `generation_metadata_json` (jsonb) - Token usage, timing
     - `validation_status` (text) - pending/valid/invalid
     - `validation_errors_json` (jsonb)
     - `created_at` (timestamptz)

   - `airspec_report_generation_messages` - Chat audit trail
     - `id` (uuid, primary key)
     - `session_id` (text) - Groups messages by conversation
     - `role` (text) - user/assistant/system
     - `content` (text) - Message body
     - `account_id` (text)
     - `created_at` (timestamptz)

2. Security
   - RLS enabled on all tables.
   - All tables use `TO anon, authenticated` policies (no auth required).
   - This is a single-tenant app without sign-in.

3. Indexes
   - airspec_dataset_rows(data_source_id)
   - airspec_report_versions(report_id)
   - airspec_report_generation_messages(session_id)
   - airspec_data_sources(enabled)
*/

-- Data Sources table
CREATE TABLE IF NOT EXISTS airspec_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  source_type text NOT NULL DEFAULT 'csv',
  fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints_json jsonb DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  row_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE airspec_data_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_data_sources" ON airspec_data_sources;
CREATE POLICY "anon_select_data_sources" ON airspec_data_sources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_data_sources" ON airspec_data_sources;
CREATE POLICY "anon_insert_data_sources" ON airspec_data_sources FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_data_sources" ON airspec_data_sources;
CREATE POLICY "anon_update_data_sources" ON airspec_data_sources FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_data_sources" ON airspec_data_sources;
CREATE POLICY "anon_delete_data_sources" ON airspec_data_sources FOR DELETE
  TO anon, authenticated USING (true);

-- Dataset Rows table
CREATE TABLE IF NOT EXISTS airspec_dataset_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES airspec_data_sources(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE airspec_dataset_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dataset_rows" ON airspec_dataset_rows;
CREATE POLICY "anon_select_dataset_rows" ON airspec_dataset_rows FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dataset_rows" ON airspec_dataset_rows;
CREATE POLICY "anon_insert_dataset_rows" ON airspec_dataset_rows FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dataset_rows" ON airspec_dataset_rows;
CREATE POLICY "anon_update_dataset_rows" ON airspec_dataset_rows FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dataset_rows" ON airspec_dataset_rows;
CREATE POLICY "anon_delete_dataset_rows" ON airspec_dataset_rows FOR DELETE
  TO anon, authenticated USING (true);

-- Reports table
CREATE TABLE IF NOT EXISTS airspec_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  current_version_id uuid,
  account_id text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE airspec_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reports" ON airspec_reports;
CREATE POLICY "anon_select_reports" ON airspec_reports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reports" ON airspec_reports;
CREATE POLICY "anon_insert_reports" ON airspec_reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reports" ON airspec_reports;
CREATE POLICY "anon_update_reports" ON airspec_reports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reports" ON airspec_reports;
CREATE POLICY "anon_delete_reports" ON airspec_reports FOR DELETE
  TO anon, authenticated USING (true);

-- Report Versions table
CREATE TABLE IF NOT EXISTS airspec_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES airspec_reports(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  schema_version text DEFAULT '1.0',
  user_prompt text,
  report_spec_json jsonb,
  generation_model text,
  generation_metadata_json jsonb,
  validation_status text DEFAULT 'pending',
  validation_errors_json jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE airspec_report_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_report_versions" ON airspec_report_versions;
CREATE POLICY "anon_select_report_versions" ON airspec_report_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_report_versions" ON airspec_report_versions;
CREATE POLICY "anon_insert_report_versions" ON airspec_report_versions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_report_versions" ON airspec_report_versions;
CREATE POLICY "anon_update_report_versions" ON airspec_report_versions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_report_versions" ON airspec_report_versions;
CREATE POLICY "anon_delete_report_versions" ON airspec_report_versions FOR DELETE
  TO anon, authenticated USING (true);

-- Generation Messages table
CREATE TABLE IF NOT EXISTS airspec_report_generation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  account_id text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE airspec_report_generation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_gen_messages" ON airspec_report_generation_messages;
CREATE POLICY "anon_select_gen_messages" ON airspec_report_generation_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_gen_messages" ON airspec_report_generation_messages;
CREATE POLICY "anon_insert_gen_messages" ON airspec_report_generation_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_gen_messages" ON airspec_report_generation_messages;
CREATE POLICY "anon_update_gen_messages" ON airspec_report_generation_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_gen_messages" ON airspec_report_generation_messages;
CREATE POLICY "anon_delete_gen_messages" ON airspec_report_generation_messages FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_airspec_dataset_rows_source ON airspec_dataset_rows(data_source_id);
CREATE INDEX IF NOT EXISTS idx_airspec_report_versions_report ON airspec_report_versions(report_id);
CREATE INDEX IF NOT EXISTS idx_airspec_gen_messages_session ON airspec_report_generation_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_airspec_data_sources_enabled ON airspec_data_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_airspec_reports_archived ON airspec_reports(archived_at);
