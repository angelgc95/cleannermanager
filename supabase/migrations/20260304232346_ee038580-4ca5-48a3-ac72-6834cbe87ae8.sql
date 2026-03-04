-- Add UPDATE policy for checklist-photos storage (needed for some upload operations)
CREATE POLICY "Users can update own checklist photos storage"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'checklist-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Add a DELETE policy for hosts on checklist photos storage
CREATE POLICY "Hosts can delete checklist photos storage"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'checklist-photos' AND public.has_role(auth.uid(), 'host'));

-- Make the INSERT policy also restrict to user's own folder for consistency
DROP POLICY IF EXISTS "Authenticated users can upload checklist photos" ON storage.objects;
CREATE POLICY "Users can upload own checklist photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'checklist-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);