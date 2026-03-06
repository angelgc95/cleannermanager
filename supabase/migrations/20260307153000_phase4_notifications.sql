-- Phase 4 notifications: in-app notifications + strict recipient RLS

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_notification_type') THEN
    CREATE TYPE public.v1_notification_type AS ENUM ('AUTOMATION', 'EXCEPTION', 'QA', 'SYSTEM');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.v1_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  event_id uuid NULL REFERENCES public.v1_events(id) ON DELETE SET NULL,
  exception_id uuid NULL REFERENCES public.v1_event_exceptions(id) ON DELETE SET NULL,
  type public.v1_notification_type NOT NULL DEFAULT 'SYSTEM',
  title text NOT NULL,
  body text NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v1_notifications_org_recipient_read_idx
  ON public.v1_notifications(organization_id, recipient_user_id, read_at);

CREATE INDEX IF NOT EXISTS v1_notifications_org_created_idx
  ON public.v1_notifications(organization_id, created_at DESC);

ALTER TABLE public.v1_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_notifications_select_self ON public.v1_notifications;
CREATE POLICY v1_notifications_select_self ON public.v1_notifications FOR SELECT
USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS v1_notifications_update_self ON public.v1_notifications;
CREATE POLICY v1_notifications_update_self ON public.v1_notifications FOR UPDATE
USING (recipient_user_id = auth.uid())
WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS v1_notifications_insert_self ON public.v1_notifications;
CREATE POLICY v1_notifications_insert_self ON public.v1_notifications FOR INSERT
WITH CHECK (recipient_user_id = auth.uid());
