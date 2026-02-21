
-- Fix overly broad storage SELECT policies

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view checklist photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view guides" ON storage.objects;

-- Restrict checklist-photos to authenticated org members
CREATE POLICY "Org users can view checklist photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'checklist-photos' AND
  get_user_org_id(auth.uid()) IS NOT NULL
);

-- Restrict guides to authenticated org members
CREATE POLICY "Org users can view guides"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'guides' AND
  get_user_org_id(auth.uid()) IS NOT NULL
);
