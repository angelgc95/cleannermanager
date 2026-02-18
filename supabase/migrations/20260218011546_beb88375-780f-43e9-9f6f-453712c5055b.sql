
-- =============================================================
-- MIGRATION 2: RLS OVERHAUL — org_id isolation + role-based access
-- =============================================================

-- Helper: drop all existing policies on a table
-- We'll do it table by table

-- ===== PROFILES =====
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view org profiles"
ON public.profiles FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ===== PROPERTIES =====
DROP POLICY IF EXISTS "Admins can manage properties" ON public.properties;
DROP POLICY IF EXISTS "Authenticated users can view properties" ON public.properties;

CREATE POLICY "Org users can view listings"
ON public.properties FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage listings"
ON public.properties FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== ROOMS =====
DROP POLICY IF EXISTS "Admins can manage rooms" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.rooms;

CREATE POLICY "Org users can view rooms"
ON public.rooms FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage rooms"
ON public.rooms FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== BOOKINGS =====
DROP POLICY IF EXISTS "Admins can manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can view bookings" ON public.bookings;

CREATE POLICY "Org users can view bookings"
ON public.bookings FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage bookings"
ON public.bookings FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== CLEANING_TASKS =====
DROP POLICY IF EXISTS "Admins can manage cleaning tasks" ON public.cleaning_tasks;
DROP POLICY IF EXISTS "Authenticated can view cleaning tasks" ON public.cleaning_tasks;
DROP POLICY IF EXISTS "Cleaners can update assigned tasks" ON public.cleaning_tasks;

-- Admins see all org tasks
CREATE POLICY "Admins can manage org cleaning tasks"
ON public.cleaning_tasks FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- Cleaners see only assigned tasks
CREATE POLICY "Cleaners can view assigned tasks"
ON public.cleaning_tasks FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND assigned_cleaner_user_id = auth.uid());

-- Cleaners can update assigned tasks
CREATE POLICY "Cleaners can update assigned tasks"
ON public.cleaning_tasks FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND assigned_cleaner_user_id = auth.uid());

-- ===== CHECKLIST_TEMPLATES =====
DROP POLICY IF EXISTS "Admins can manage templates" ON public.checklist_templates;
DROP POLICY IF EXISTS "Authenticated can view templates" ON public.checklist_templates;

CREATE POLICY "Org users can view templates"
ON public.checklist_templates FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL);

CREATE POLICY "Admins can manage templates"
ON public.checklist_templates FOR ALL
USING ((org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== CHECKLIST_SECTIONS =====
DROP POLICY IF EXISTS "Admins can manage sections" ON public.checklist_sections;
DROP POLICY IF EXISTS "Authenticated can view sections" ON public.checklist_sections;

CREATE POLICY "Org users can view sections"
ON public.checklist_sections FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL);

CREATE POLICY "Admins can manage sections"
ON public.checklist_sections FOR ALL
USING ((org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== CHECKLIST_ITEMS =====
DROP POLICY IF EXISTS "Admins can manage items" ON public.checklist_items;
DROP POLICY IF EXISTS "Authenticated can view items" ON public.checklist_items;

CREATE POLICY "Org users can view items"
ON public.checklist_items FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL);

CREATE POLICY "Admins can manage items"
ON public.checklist_items FOR ALL
USING ((org_id = public.get_user_org_id(auth.uid()) OR org_id IS NULL) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== CHECKLIST_RUNS =====
DROP POLICY IF EXISTS "Authenticated can view runs" ON public.checklist_runs;
DROP POLICY IF EXISTS "Cleaners can insert runs" ON public.checklist_runs;
DROP POLICY IF EXISTS "Cleaners can update own runs" ON public.checklist_runs;

CREATE POLICY "Org admins can view all runs"
ON public.checklist_runs FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Cleaners can view own runs"
ON public.checklist_runs FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND cleaner_user_id = auth.uid());

CREATE POLICY "Cleaners can insert runs"
ON public.checklist_runs FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND cleaner_user_id = auth.uid());

CREATE POLICY "Cleaners can update own runs"
ON public.checklist_runs FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND cleaner_user_id = auth.uid());

-- ===== CHECKLIST_RESPONSES =====
DROP POLICY IF EXISTS "Authenticated can view responses" ON public.checklist_responses;
DROP POLICY IF EXISTS "Users can insert responses for own runs" ON public.checklist_responses;
DROP POLICY IF EXISTS "Users can update responses for own runs" ON public.checklist_responses;

CREATE POLICY "Org users can view responses"
ON public.checklist_responses FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert responses"
ON public.checklist_responses FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND EXISTS (SELECT 1 FROM checklist_runs WHERE id = checklist_responses.run_id AND cleaner_user_id = auth.uid()));

CREATE POLICY "Users can update responses"
ON public.checklist_responses FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND EXISTS (SELECT 1 FROM checklist_runs WHERE id = checklist_responses.run_id AND cleaner_user_id = auth.uid()));

-- ===== CHECKLIST_PHOTOS =====
DROP POLICY IF EXISTS "Authenticated can view checklist photos" ON public.checklist_photos;
DROP POLICY IF EXISTS "Users can insert photos for own runs" ON public.checklist_photos;
DROP POLICY IF EXISTS "Users can delete photos for own runs" ON public.checklist_photos;

CREATE POLICY "Org users can view photos"
ON public.checklist_photos FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert photos"
ON public.checklist_photos FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND EXISTS (SELECT 1 FROM checklist_runs WHERE id = checklist_photos.run_id AND cleaner_user_id = auth.uid()));

CREATE POLICY "Users can delete photos"
ON public.checklist_photos FOR DELETE
USING (org_id = public.get_user_org_id(auth.uid()) AND EXISTS (SELECT 1 FROM checklist_runs WHERE id = checklist_photos.run_id AND cleaner_user_id = auth.uid()));

-- ===== LOG_HOURS =====
DROP POLICY IF EXISTS "Users can view own hours" ON public.log_hours;
DROP POLICY IF EXISTS "Users can insert own hours" ON public.log_hours;
DROP POLICY IF EXISTS "Users can update own hours" ON public.log_hours;
DROP POLICY IF EXISTS "Users can delete own hours" ON public.log_hours;

CREATE POLICY "Users can view hours"
ON public.log_hours FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Users can insert own hours"
ON public.log_hours FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users can update own hours"
ON public.log_hours FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users can delete own hours"
ON public.log_hours FOR DELETE
USING (org_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

-- ===== EXPENSES =====
DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view expenses" ON public.expenses;

CREATE POLICY "Users can view org expenses"
ON public.expenses FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND (created_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Users can insert expenses"
ON public.expenses FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND created_by_user_id = auth.uid());

CREATE POLICY "Admins can manage expenses"
ON public.expenses FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== MAINTENANCE_TICKETS =====
DROP POLICY IF EXISTS "Authenticated can view tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Users can create tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Users can update own tickets" ON public.maintenance_tickets;

CREATE POLICY "Org users can view tickets"
ON public.maintenance_tickets FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can create tickets"
ON public.maintenance_tickets FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND created_by_user_id = auth.uid());

CREATE POLICY "Users can update tickets"
ON public.maintenance_tickets FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND (created_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== MAINTENANCE_UPDATES =====
DROP POLICY IF EXISTS "Authenticated can view updates" ON public.maintenance_updates;
DROP POLICY IF EXISTS "Users can create updates" ON public.maintenance_updates;

CREATE POLICY "Org users can view updates"
ON public.maintenance_updates FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can create updates"
ON public.maintenance_updates FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND created_by_user_id = auth.uid());

-- ===== PRODUCTS =====
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;

CREATE POLICY "Org users can view products"
ON public.products FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage products"
ON public.products FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== SHOPPING_LIST =====
DROP POLICY IF EXISTS "Authenticated can view shopping list" ON public.shopping_list;
DROP POLICY IF EXISTS "Users can create shopping items" ON public.shopping_list;
DROP POLICY IF EXISTS "Authenticated users can update shopping items" ON public.shopping_list;
DROP POLICY IF EXISTS "Admins can delete shopping items" ON public.shopping_list;

CREATE POLICY "Org users can view shopping list"
ON public.shopping_list FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can create shopping items"
ON public.shopping_list FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND created_by_user_id = auth.uid());

CREATE POLICY "Users can update shopping items"
ON public.shopping_list FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND (created_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Admins can delete shopping items"
ON public.shopping_list FOR DELETE
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== GUIDES_FOLDERS =====
DROP POLICY IF EXISTS "Admins can manage folders" ON public.guides_folders;
DROP POLICY IF EXISTS "Authenticated can view folders" ON public.guides_folders;

CREATE POLICY "Org users can view folders"
ON public.guides_folders FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage folders"
ON public.guides_folders FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== GUIDES =====
DROP POLICY IF EXISTS "Admins can manage guides" ON public.guides;
DROP POLICY IF EXISTS "Authenticated can view guides" ON public.guides;

CREATE POLICY "Org users can view guides"
ON public.guides FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage guides"
ON public.guides FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== PAYOUT_PERIODS =====
DROP POLICY IF EXISTS "Admins can manage payout periods" ON public.payout_periods;
DROP POLICY IF EXISTS "Admins can view payout periods" ON public.payout_periods;

CREATE POLICY "Admins can manage payout periods"
ON public.payout_periods FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Admins can view payout periods"
ON public.payout_periods FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== PAYOUTS =====
DROP POLICY IF EXISTS "Admins can manage payouts" ON public.payouts;
DROP POLICY IF EXISTS "Cleaners can view own payouts" ON public.payouts;

CREATE POLICY "Admins can manage payouts"
ON public.payouts FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Cleaners can view own payouts"
ON public.payouts FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND (cleaner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== NOTIFICATION_JOBS =====
DROP POLICY IF EXISTS "Admins can view all notification jobs" ON public.notification_jobs;
DROP POLICY IF EXISTS "System can manage notification jobs" ON public.notification_jobs;
DROP POLICY IF EXISTS "Users can view own notification jobs" ON public.notification_jobs;

CREATE POLICY "Admins can manage notification jobs"
ON public.notification_jobs FOR ALL
USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Users can view own notification jobs"
ON public.notification_jobs FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

-- ===== NOTIFICATION_PREFERENCES =====
-- These stay user-scoped, no org_id needed (table has no org_id)
-- Keep existing policies as-is

-- ===== IN_APP_NOTIFICATIONS =====
DROP POLICY IF EXISTS "Admins can insert in-app notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can update own in-app notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can view own in-app notifications" ON public.in_app_notifications;

CREATE POLICY "Users can view own notifications"
ON public.in_app_notifications FOR SELECT
USING (org_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
ON public.in_app_notifications FOR UPDATE
USING (org_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Admins can insert notifications"
ON public.in_app_notifications FOR INSERT
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- ===== USER_ROLES =====
-- Keep existing: admins manage, users view own
-- No org_id on user_roles (roles are global per user)
