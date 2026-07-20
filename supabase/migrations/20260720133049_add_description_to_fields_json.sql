/*
# Add Description Support to fields_json in airspec_data_sources

1. Schema Change
   - `airspec_data_sources.fields_json` JSONB entries now support an optional `description` key
   - Previous shape: [{name: string, type: string}]
   - New shape: [{name: string, type: string, description?: string}]
   - No column change needed (JSONB is schema-flexible); this migration adds a 
     COMMENT documenting the expected shape for future reference.

2. Notes
   - Existing rows are unchanged; missing `description` keys are treated as null by application code.
   - No data is modified or dropped.
*/

-- Document the expected JSONB shape for fields_json
COMMENT ON COLUMN airspec_data_sources.fields_json IS 'Array of field definitions. Each entry: {name: string (required), type: string (required), description: string (optional)}. Description provides semantic context for AI generation prompts.';
