/*
# Add model column to airspec_reports

1. Modified Tables
   - `airspec_reports`
     - Added `model` (text, nullable) - The AI model ID chosen for this report (e.g. "gpt-4o", "claude-sonnet-4-6"). Once set during creation, cannot be changed.

2. Notes
   - Stores the user's model choice so that editing continues with the same model
   - Existing reports will have NULL model (defaults to system default)
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'airspec_reports' AND column_name = 'model'
  ) THEN
    ALTER TABLE airspec_reports ADD COLUMN model text;
  END IF;
END $$;
