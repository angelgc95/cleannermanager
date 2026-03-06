# Migration Notes — Foundation V1 + Ops (Phase 3/4 + Hardening)

## What changed

- Foundation V1 schema and app shells (`/console/*`, `/field/*`) remain the base.
- Phase 3 added ops workflow primitives:
  - `v1_rules`, `v1_rule_runs`
  - `v1_event_exceptions`, `v1_qa_reviews`
  - edge functions: `run-automations-v1`, `checklist-submit-v1`, `qa-decision-v1`
  - hardened `sync-ics-v1` cancellation + drift handling
- Phase 4 added proactive scheduling + in-app notifications:
  - `v1_notifications` with recipient-only RLS
  - edge function: `schedule-ops-v1` (internal scheduler endpoint)
  - `run-automations-v1` now writes notifications for `notify` actions
  - Console + Field notification pages and unread badges
- Later phases added:
  - bulk template/rule provisioning by unit
  - generic signed webhooks (`dispatch-webhooks-v1`)
  - server-side weekly unit stats (`compute-stats-v1`)
  - system logs + rate-limit storage

## Local run checklist

1. Apply DB migrations:
   - `supabase db reset` or `supabase migration up`
2. Deploy/update edge functions:
   - `supabase functions deploy onboard-organization`
   - `supabase functions deploy sync-ics-v1`
   - `supabase functions deploy reset-event-v1`
   - `supabase functions deploy run-automations-v1`
   - `supabase functions deploy checklist-submit-v1`
  - `supabase functions deploy qa-decision-v1`
  - `supabase functions deploy schedule-ops-v1`
  - `supabase functions deploy dispatch-webhooks-v1`
  - `supabase functions deploy compute-stats-v1`
3. Frontend checks:
   - `npm install`
   - `npm run typecheck`
   - `npm run build`

## Scheduler operation (manual endpoint)

Cron is **not** configured in-repo. Use an external cron/worker to call `schedule-ops-v1`.

Recommended cadence: **every 5 minutes**.

Example manual invocation:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/schedule-ops-v1" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "x-internal-service-key: <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"lookahead_minutes":60,"overdue_minutes":15}'
```

Optional org-scoped run:

```bash
{"organization_id":"<ORG_UUID>","lookahead_minutes":60,"overdue_minutes":15}
```

## Server stats (manual endpoint)

`compute-stats-v1` precomputes weekly KPIs into `v1_unit_weekly_stats`.

Example manual invocation:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/compute-stats-v1" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "x-internal-service-key: <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"organization_id":"<ORG_UUID>","week_start":"2026-03-02"}'
```

## Intentional gaps (current V1 scope)

- Notifications are in-app only; outbound integrations are generic webhooks only.
- Rule recipient scope matching for role-based notify is ORG-wide MVP.
- Scheduler is exposed as a secure manual endpoint for external cron; no repo-managed cron spec yet.
