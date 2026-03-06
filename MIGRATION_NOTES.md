# Migration Notes — Foundation V1

## What changed

- Added a new V1 data model under `v1_*` tables for multi-tenant organizations, optional unit hierarchy, scoped RBAC, cleaner listing assignments, bookings/events, checklist runs, manual entries, payouts, and guides.
- Added strict V1 RLS helper functions and table policies to enforce tenant isolation and cleaner visibility limits.
- Added private storage bucket `v1-checklist-photos` with object policies tied to run/org ownership.
- Added new edge functions:
  - `onboard-organization`
  - `sync-ics-v1`
  - `reset-event-v1`
- Replaced app shell with V1 routes:
  - `/console/*` for Ops Console
  - `/field/*` for Field App
- Updated auth flow to V1 onboarding and organization-first role loading.

## Local run checklist

1. Apply DB migration:
   - `supabase db reset` or `supabase migration up`
2. Deploy/update edge functions:
   - `supabase functions deploy onboard-organization`
   - `supabase functions deploy sync-ics-v1`
   - `supabase functions deploy reset-event-v1`
3. Start frontend:
   - `npm install`
   - `npm run typecheck`
   - `npm run build`

## Intentional gaps (V1 foundation scope)

- Automations screen is a stub (no engine yet).
- No historical checklist versioning; one run per event (`event_id` unique) and reset is destructive by design.
- ICS parser is intentionally minimal for skeleton readiness.
