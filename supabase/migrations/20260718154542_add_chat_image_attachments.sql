/*
# Add image attachments support for report chat

1. Modified Tables
   - `airspec_report_generation_messages`
     - Added `attachments_json` (jsonb, nullable) - Array of image attachment objects
       Each attachment: { id, path, url, filename, contentType, size }

2. New Storage
   - Created `airspec-chat-images` bucket for storing chat image attachments
   - Public bucket (images referenced by URL in AI prompts)

3. Security
   - Storage bucket allows anon + authenticated uploads/reads
   - SELECT, INSERT policies on storage.objects for the bucket
*/

-- Add attachments column to messages table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'airspec_report_generation_messages'
    AND column_name = 'attachments_json'
  ) THEN
    ALTER TABLE airspec_report_generation_messages
    ADD COLUMN attachments_json jsonb DEFAULT NULL;
  END IF;
END $$;

-- Create storage bucket for chat images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'airspec-chat-images',
  'airspec-chat-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow anon + authenticated to upload and read
DROP POLICY IF EXISTS "airspec_chat_images_select" ON storage.objects;
CREATE POLICY "airspec_chat_images_select" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'airspec-chat-images');

DROP POLICY IF EXISTS "airspec_chat_images_insert" ON storage.objects;
CREATE POLICY "airspec_chat_images_insert" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'airspec-chat-images');

DROP POLICY IF EXISTS "airspec_chat_images_delete" ON storage.objects;
CREATE POLICY "airspec_chat_images_delete" ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'airspec-chat-images');
