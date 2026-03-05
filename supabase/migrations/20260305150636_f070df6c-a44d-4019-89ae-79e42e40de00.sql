
-- Phase 0: RLS Security Hardening
-- Tighten all role-only policies to owner-scoped

-- 1. checklist_photos: scope host SELECT to own host_user_id
DROP POLICY "Host can view photos" ON checklist_photos;
CREATE POLICY "Host can view own photos" ON checklist_photos
  FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

-- 2. checklist_responses: scope host SELECT to own host_user_id
DROP POLICY "Host can view responses" ON checklist_responses;
CREATE POLICY "Host can view own responses" ON checklist_responses
  FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

-- 3. maintenance_updates: scope host manage to own host_user_id
DROP POLICY "Host can manage updates" ON maintenance_updates;
CREATE POLICY "Host can manage own updates" ON maintenance_updates
  FOR ALL TO authenticated
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

-- 4. maintenance_updates: scope view to host-owned or own-created or assigned cleaner
DROP POLICY "Users can view updates" ON maintenance_updates;
CREATE POLICY "Users can view related updates" ON maintenance_updates
  FOR SELECT TO authenticated
  USING (
    host_user_id = auth.uid()
    OR created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM maintenance_tickets mt
      WHERE mt.id = maintenance_updates.ticket_id
      AND cleaner_is_assigned_to_host(auth.uid(), mt.host_user_id)
    )
  );

-- 5. profiles: scope host view to own + assigned cleaners only
DROP POLICY "Host can view all profiles" ON profiles;
CREATE POLICY "Host can view assigned profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cleaner_assignments ca
      WHERE ca.host_user_id = auth.uid()
      AND ca.cleaner_user_id = profiles.user_id
    )
  );

-- 6. in_app_notifications: scope insert to host's own notifications
DROP POLICY "Host can insert notifications" ON in_app_notifications;
CREATE POLICY "Host can insert own notifications" ON in_app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    host_user_id = auth.uid()
    AND has_role(auth.uid(), 'host')
  );
CREATE POLICY "Cleaner can insert notifications to host" ON in_app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = host_user_id
    AND cleaner_is_assigned_to_host(auth.uid(), host_user_id)
  );

-- 7. Storage: guides upload — restrict to hosts uploading in own folder
DROP POLICY IF EXISTS "Authenticated users can upload guides" ON storage.objects;
CREATE POLICY "Host can upload own guides" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guides'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND has_role(auth.uid(), 'host')
  );

-- 8. Storage: guides delete — restrict to host who owns the folder
DROP POLICY IF EXISTS "Admins can delete guides" ON storage.objects;
CREATE POLICY "Host can delete own guides" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'guides'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND has_role(auth.uid(), 'host')
  );

-- 9. Storage: checklist-photos host delete — scope to assigned cleaners
DROP POLICY IF EXISTS "Hosts can delete checklist photos storage" ON storage.objects;
CREATE POLICY "Host can delete assigned checklist photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'checklist-photos'
    AND has_role(auth.uid(), 'host')
    AND EXISTS (
      SELECT 1 FROM checklist_runs cr
      WHERE cr.host_user_id = auth.uid()
      AND cr.cleaner_user_id::text = (storage.foldername(name))[1]
    )
  );
