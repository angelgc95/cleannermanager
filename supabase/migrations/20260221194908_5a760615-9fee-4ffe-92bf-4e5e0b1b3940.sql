
-- Create storage bucket for guides (documents, images, videos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('guides', 'guides', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to guides bucket
CREATE POLICY "Authenticated users can upload guides"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'guides');

-- Allow authenticated users to view guides
CREATE POLICY "Anyone can view guides"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'guides');

-- Allow admins/managers to delete guides
CREATE POLICY "Admins can delete guides"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'guides');
