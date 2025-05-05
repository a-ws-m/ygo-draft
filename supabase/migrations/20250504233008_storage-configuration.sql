-- Update the existing buckets to be private
UPDATE storage.buckets 
SET public = false
WHERE id IN ('card_images', 'card_images_small');

-- Replace the public access policies with authenticated user policies
DROP POLICY IF EXISTS "Public Access for card_images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access for card_images_small" ON storage.objects;

-- Create policies for authenticated users to read card images
CREATE POLICY "Authenticated users can read card_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card_images' AND auth.role() IS NOT NULL);

CREATE POLICY "Authenticated users can read card_images_small"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card_images_small' AND auth.role() IS NOT NULL);

-- Keep service role policies for uploading
-- These are already correctly set in the original migration

-- Update cards table to remove redundant URL columns
ALTER TABLE cards
DROP COLUMN IF EXISTS image_url,
DROP COLUMN IF EXISTS small_image_url;