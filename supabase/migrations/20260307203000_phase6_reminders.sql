-- Phase 6: cleaner reminders before ready-by deadline

CREATE TABLE IF NOT EXISTS public.v1_event_reminder_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE REFERENCES public.v1_events(id) ON DELETE CASCADE,
  last_reminder_60_at timestamptz NULL,
  last_reminder_30_at timestamptz NULL,
  last_reminder_15_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v1_event_reminder_state_org_event_idx
  ON public.v1_event_reminder_state(organization_id, event_id);

ALTER TABLE public.v1_event_reminder_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_event_reminder_state_service_only_all ON public.v1_event_reminder_state;
CREATE POLICY v1_event_reminder_state_service_only_all
ON public.v1_event_reminder_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
