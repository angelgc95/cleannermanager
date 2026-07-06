-- Tighten private bucket object reads to metadata-backed relationships.

DROP POLICY IF EXISTS "Org users can view checklist photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own checklist photos" ON storage.objects;
DROP POLICY IF EXISTS "Hosts can read all checklist photos" ON storage.objects;
DROP POLICY IF EXISTS "Org users can view guides" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read guides" ON storage.objects;

CREATE POLICY "Users can read own checklist photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND ((select auth.uid())::text = (storage.foldername(name))[1])
);

CREATE POLICY "Hosts can read checklist run photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND public.has_role((select auth.uid()), 'host')
  AND EXISTS (
    SELECT 1
    FROM public.checklist_runs cr
    WHERE cr.host_user_id = (select auth.uid())
      AND cr.cleaner_user_id::text = (storage.foldername(name))[1]
      AND cr.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY "Users can read related maintenance photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'checklist-photos'
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_tickets mt
    WHERE (mt.pic1_url = name OR mt.pic2_url = name)
      AND (
        mt.created_by_user_id = (select auth.uid())
        OR mt.host_user_id = (select auth.uid())
        OR public.cleaner_is_assigned_to_host((select auth.uid()), mt.host_user_id)
      )
  )
);

CREATE POLICY "Users can read related guide files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'guides'
  AND EXISTS (
    SELECT 1
    FROM public.guides g
    WHERE g.pdf_url = name
      AND (
        g.host_user_id = (select auth.uid())
        OR public.cleaner_is_assigned_to_host((select auth.uid()), g.host_user_id)
      )
  )
);
