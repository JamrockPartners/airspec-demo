/*
# Add slug column to airspec_data_sources

## Purpose
AIRspec 1.1 requires dataset `source` references to be spec-compliant ids
(matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/). Raw UUIDs violate this grammar
(they start with a digit). This migration adds a human-readable, unique `slug`
column to `airspec_data_sources` so reports can reference data sources by slug
instead of UUID.

## Changes
1. New column: `airspec_data_sources.slug` (text, unique, not null).
   - Auto-derived from the source name: lowercase, non-alphanumeric chars
     collapsed to underscores, trimmed, prefixed with `ds_` if the result
     would start with a digit.
2. Backfill: every existing row gets a slug derived from its name.
3. Unique index on `slug` to enforce uniqueness.

## Security
- No RLS policy changes. Existing policies remain in effect.
- The slug is derived from public data (the source name) and is safe to expose.

## Notes
- The `id` (UUID) column is retained; it remains the primary key and the
  foreign key target for `airspec_dataset_rows.data_source_id`. The slug is an
  additional human-readable identifier used only in AIRspec document `source`
  references.
- The broker resolves slug -> id -> rows at request time.
*/

-- 1. Add the column as nullable first so we can backfill.
ALTER TABLE airspec_data_sources
  ADD COLUMN IF NOT EXISTS slug text;

-- 2. Backfill existing rows from name.
--    Derive: lowercase, replace non [a-z0-9] runs with _, trim underscores,
--    prefix ds_ if it starts with a digit, fallback ds_source if empty.
UPDATE airspec_data_sources
SET slug = CASE
  WHEN (
    lower(regexp_replace(
      regexp_replace(COALESCE(name, 'source'), '[^a-zA-Z0-9]+', '_', 'g'),
      '^_|_+$', '', 'g'
    )) ~ '^[0-9]'
  ) THEN 'ds_' || lower(regexp_replace(
      regexp_replace(COALESCE(name, 'source'), '[^a-zA-Z0-9]+', '_', 'g'),
      '^_|_+$', '', 'g'
    ))
  WHEN (
    lower(regexp_replace(
      regexp_replace(COALESCE(name, 'source'), '[^a-zA-Z0-9]+', '_', 'g'),
      '^_|_+$', '', 'g'
    )) = ''
  ) THEN 'ds_source'
  ELSE lower(regexp_replace(
      regexp_replace(COALESCE(name, 'source'), '[^a-zA-Z0-9]+', '_', 'g'),
      '^_|_+$', '', 'g'
    ))
END
WHERE slug IS NULL;

-- 3. Make it not null + unique.
ALTER TABLE airspec_data_sources
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_airspec_data_sources_slug
  ON airspec_data_sources (slug);
