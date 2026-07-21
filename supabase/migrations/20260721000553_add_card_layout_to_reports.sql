/*
# Add card_layout column to airspec_reports

1. Modified Tables
   - `airspec_reports`
     - `card_layout` (text, nullable, default null) - Per-report dashboard card preference: 'tall' or 'wide'. Null means auto/default.

2. Notes
   - No data migration needed; existing reports will default to null (auto layout).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'airspec_reports' AND column_name = 'card_layout'
  ) THEN
    ALTER TABLE airspec_reports ADD COLUMN card_layout text DEFAULT NULL;
  END IF;
END $$;
