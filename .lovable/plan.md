

## Plan: Phase 0 — RLS Security Hardening

### Problems Identified

**Table RLS issues (role-only, not owner-scoped):**

1. **`checklist_photos`** — "Host can view photos" uses `has_role(auth.uid(), 'host')` → any host sees ALL hosts' photos
2. **`checklist_responses`** — "Host can view responses" uses `has_role(auth.uid(), 'host')` → same
3. **`maintenance_updates`** — "Host can manage updates" uses `has_role(auth.uid(), 'host')` → any host can INSERT/UPDATE/DELETE any host's updates
4. **`maintenance_updates`** — "Users can view updates" uses `true` → any authenticated user sees all updates
5. **`profiles`** — "Host can view all profiles" uses `has_role(auth.uid(), 'host')` → any host sees all profiles (cross-tenant)
6. **`in_app_notifications`** — INSERT uses `has_role(auth.uid(), 'host')` → any host can insert notifications for any user

**Storage RLS issues:**
7. **`guides` upload** — "Authenticated users can upload guides" allows ANY authenticated user to upload (no host check)
8. **`guides` delete** — "Admins can delete guides" allows ANY authenticated user to delete (no owner check)
9. **`checklist-photos` host delete** — "Hosts can delete checklist photos storage" uses `has_role(auth.uid(), 'host')` without owner scope

### Migration: Fix All Policies

Single migration that drops and recreates each problematic policy:

```sql
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

-- 4. maintenance_updates: scope view to host-owned or own-created
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

-- 5. profiles: scope host view to cleaners assigned to them + own
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

-- 6. in_app_notifications: scope insert to own user_id or host inserting for assigned cleaners
DROP POLICY "Host can insert notifications" ON in_app_notifications;
CREATE POLICY "Host can insert own notifications" ON in_app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    host_user_id = auth.uid()
    AND has_role(auth.uid(), 'host')
  );
-- Also allow cleaners to insert (for reset requests to their host)
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

-- 9. Storage: checklist-photos host delete — scope to host_user_id folder
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
```

### Note on profiles policy
The current "Users can view own profile" policy already covers self-access. The new "Host can view assigned profiles" replaces the overly broad host policy but still allows hosts to see profiles of their assigned cleaners (needed for the app to function).

### No code changes needed
All fixes are pure SQL policy replacements. No frontend code references these policies directly — the Supabase client just sends requests and RLS enforces access.

### Files
1. **Create** one new migration file with all policy drops/recreates above

