DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_webhook_event') THEN
    CREATE TYPE public.v1_webhook_event AS ENUM (
      'EXCEPTION_CREATED',
      'EXCEPTION_ESCALATED',
      'QA_REQUIRED',
      'QA_REJECTED',
      'QA_APPROVED',
      'SLA_BREACH',
      'EVENT_CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.v1_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  signing_secret text NULL,
  events public.v1_webhook_event[] NOT NULL DEFAULT '{}'::public.v1_webhook_event[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v1_webhooks_org_created_idx
  ON public.v1_webhooks(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS v1_webhooks_org_enabled_idx
  ON public.v1_webhooks(organization_id, enabled);

ALTER TABLE public.v1_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_webhooks_select ON public.v1_webhooks;
CREATE POLICY v1_webhooks_select ON public.v1_webhooks FOR SELECT
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_webhooks_write ON public.v1_webhooks;
CREATE POLICY v1_webhooks_write ON public.v1_webhooks FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));
