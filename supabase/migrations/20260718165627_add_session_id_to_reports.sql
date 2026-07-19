/*
# Add session_id to airspec_reports

1. Modified Tables
   - `airspec_reports`
     - Added `session_id` (text, nullable) - Links report to its chat session for edit history retrieval

2. Indexes
   - idx_airspec_reports_session_id on airspec_reports(session_id)

3. Notes
   - This allows fetching chat history when re-editing a report
   - Existing reports will have NULL session_id (no chat history available)
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'airspec_reports' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE airspec_reports ADD COLUMN session_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_airspec_reports_session_id ON airspec_reports(session_id);
