-- Allow authenticated users to read their own checklist photos
CREATE POLICY "Users can read own checklist photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'checklist-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Allow hosts to read all checklist photos
CREATE POLICY "Hosts can read all checklist photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'checklist-photos' AND public.has_role(auth.uid(), 'host'));

-- Allow authenticated users to read guides
CREATE POLICY "Authenticated users can read guides"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'guides');