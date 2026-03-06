# Migration Notes — Foundation V1 + Ops (Phase 3/4)

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
3. Frontend checks:
   - `npm install`
   - `npm run typecheck`
   - `npm run build`

## Scheduler operation (manual endpoint)

Cron is **not** configured in-repo. Use an external cron/worker to call `schedule-ops-v1`.

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

## Intentional gaps (current V1 scope)

- Notifications are in-app only (no email/Slack dispatch yet).
- Rule recipient scope matching for role-based notify is ORG-wide MVP.
- Scheduler is exposed as a secure manual endpoint for external cron; no repo-managed cron spec yet.
