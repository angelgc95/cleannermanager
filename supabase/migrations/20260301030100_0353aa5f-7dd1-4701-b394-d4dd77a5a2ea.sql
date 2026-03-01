
-- =============================================================
-- PHASE 1: Add default_checklist_template_id to listings
-- =============================================================
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS default_checklist_template_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

-- Populate default_checklist_template_id from existing template assignments
UPDATE public.listings l
SET default_checklist_template_id = ct.id
FROM public.checklist_templates ct
WHERE ct.listing_id = l.id AND ct.active = true AND l.default_checklist_template_id IS NULL;

-- =============================================================
-- PHASE 2: Create cleaning_events table
-- =============================================================
CREATE TABLE public.cleaning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  next_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  host_user_id uuid NOT NULL,
  assigned_cleaner_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  source text DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'MANUAL')),
  checklist_template_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  checklist_run_id uuid,
  event_details_json jsonb DEFAULT '{}'::jsonb,
  notes text,
  reference text,
  locked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, booking_id)
);

ALTER TABLE public.cleaning_events ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- PHASE 3: Migrate data from cleaning_tasks to cleaning_events
-- =============================================================
INSERT INTO public.cleaning_events (
  id, listing_id, booking_id, next_booking_id, host_user_id,
  assigned_cleaner_id, start_at, end_at, status, source,
  checklist_template_id, checklist_run_id,
  event_details_json, notes, reference, locked, created_at, updated_at
)
SELECT
  ct.id,
  ct.listing_id,
  ct.previous_booking_id,
  ct.next_booking_id,
  ct.host_user_id,
  ct.assigned_cleaner_user_id,
  ct.start_at,
  ct.end_at,
  ct.status::text,
  ct.source::text,
  l.default_checklist_template_id,
  ct.checklist_run_id,
  jsonb_build_object(
    'nights', ct.nights_to_show,
    'guests', ct.guests_to_show,
    'reference', ct.reference
  ),
  ct.notes,
  ct.reference,
  ct.locked,
  ct.created_at,
  ct.updated_at
FROM public.cleaning_tasks ct
LEFT JOIN public.listings l ON l.id = ct.listing_id;

-- =============================================================
-- PHASE 4: Update dependent tables to reference cleaning_events
-- =============================================================

-- checklist_runs: add cleaning_event_id, populate, then drop cleaning_task_id
ALTER TABLE public.checklist_runs ADD COLUMN cleaning_event_id uuid REFERENCES public.cleaning_events(id) ON DELETE SET NULL;
UPDATE public.checklist_runs SET cleaning_event_id = cleaning_task_id;
ALTER TABLE public.checklist_runs DROP CONSTRAINT IF EXISTS checklist_runs_cleaning_task_id_fkey;
ALTER TABLE public.checklist_runs DROP COLUMN cleaning_task_id;

-- log_hours: add cleaning_event_id, populate, then drop cleaning_task_id
ALTER TABLE public.log_hours ADD COLUMN cleaning_event_id uuid REFERENCES public.cleaning_events(id) ON DELETE SET NULL;
UPDATE public.log_hours SET cleaning_event_id = cleaning_task_id;
ALTER TABLE public.log_hours DROP CONSTRAINT IF EXISTS log_hours_cleaning_task_id_fkey;
ALTER TABLE public.log_hours DROP COLUMN cleaning_task_id;

-- notification_jobs: add cleaning_event_id, populate, then drop cleaning_task_id
-- Must drop trigger first, then constraints
DROP TRIGGER IF EXISTS manage_notification_jobs_trigger ON public.cleaning_tasks;

ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_cleaning_task_id_user_id_type_key;
ALTER TABLE public.notification_jobs ADD COLUMN cleaning_event_id uuid REFERENCES public.cleaning_events(id) ON DELETE CASCADE;
UPDATE public.notification_jobs SET cleaning_event_id = cleaning_task_id;
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_cleaning_task_id_fkey;
ALTER TABLE public.notification_jobs DROP COLUMN cleaning_task_id;
ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_event_user_type_key UNIQUE (cleaning_event_id, user_id, type);

-- =============================================================
-- PHASE 5: Drop cleaning_tasks table and related constraints
-- =============================================================
ALTER TABLE public.cleaning_events DROP COLUMN IF EXISTS checklist_run_id;
-- Add back checklist_run_id FK to cleaning_events from checklist_runs
ALTER TABLE public.cleaning_events ADD COLUMN checklist_run_id uuid REFERENCES public.checklist_runs(id) ON DELETE SET NULL;
-- Copy run references
UPDATE public.cleaning_events ce
SET checklist_run_id = cr.id
FROM public.checklist_runs cr
WHERE cr.cleaning_event_id = ce.id AND cr.finished_at IS NOT NULL;

DROP TABLE public.cleaning_tasks CASCADE;

-- =============================================================
-- PHASE 6: RLS Policies for cleaning_events
-- =============================================================
CREATE POLICY "Host can manage events" ON public.cleaning_events FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view assigned events" ON public.cleaning_events FOR SELECT USING (cleaner_has_listing_access(auth.uid(), listing_id));
CREATE POLICY "Cleaner can update assigned events" ON public.cleaning_events FOR UPDATE USING (assigned_cleaner_id = auth.uid());

-- =============================================================
-- PHASE 7: Triggers for cleaning_events
-- =============================================================
CREATE TRIGGER update_cleaning_events_updated_at BEFORE UPDATE ON public.cleaning_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update notification trigger to work with cleaning_events
CREATE OR REPLACE FUNCTION public.manage_notification_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event RECORD; v_user_id UUID; v_scheduled_12h TIMESTAMPTZ; v_scheduled_1h TIMESTAMPTZ;
  v_scheduled_2pm TIMESTAMPTZ; v_listing_tz TEXT; v_event_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.notification_jobs SET status = 'SKIPPED' WHERE cleaning_event_id = OLD.id AND status = 'SCHEDULED';
    RETURN OLD;
  END IF;
  v_event := NEW;
  IF v_event.status IN ('DONE', 'CANCELLED') THEN
    UPDATE public.notification_jobs SET status = 'SKIPPED' WHERE cleaning_event_id = v_event.id AND status = 'SCHEDULED';
    RETURN NEW;
  END IF;
  IF v_event.assigned_cleaner_id IS NULL OR v_event.start_at IS NULL THEN RETURN NEW; END IF;
  v_user_id := v_event.assigned_cleaner_id;
  SELECT COALESCE(timezone, 'Europe/London') INTO v_listing_tz FROM public.listings WHERE id = v_event.listing_id;
  v_scheduled_12h := v_event.start_at - INTERVAL '12 hours';
  v_scheduled_1h := v_event.start_at - INTERVAL '1 hour';
  v_event_date := (v_event.start_at AT TIME ZONE COALESCE(v_listing_tz, 'UTC'))::DATE;
  v_scheduled_2pm := (v_event_date || ' 14:00:00')::TIMESTAMP AT TIME ZONE COALESCE(v_listing_tz, 'UTC');
  IF v_scheduled_12h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_event_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_event.id, v_user_id, v_event.host_user_id, 'REMINDER_12H', v_scheduled_12h, 'SCHEDULED')
    ON CONFLICT (cleaning_event_id, user_id, type) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;
  IF v_scheduled_1h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_event_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_event.id, v_user_id, v_event.host_user_id, 'REMINDER_1H', v_scheduled_1h, 'SCHEDULED')
    ON CONFLICT (cleaning_event_id, user_id, type) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;
  IF v_scheduled_2pm > now() THEN
    INSERT INTO public.notification_jobs (cleaning_event_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_event.id, v_user_id, v_event.host_user_id, 'CHECKLIST_2PM', v_scheduled_2pm, 'SCHEDULED')
    ON CONFLICT (cleaning_event_id, user_id, type) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER manage_notification_jobs_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.cleaning_events
FOR EACH ROW EXECUTE FUNCTION public.manage_notification_jobs();

-- =============================================================
-- PHASE 8: Add unique constraint on checklist_runs.cleaning_event_id
-- =============================================================
ALTER TABLE public.checklist_runs ADD CONSTRAINT checklist_runs_cleaning_event_unique UNIQUE (cleaning_event_id);
