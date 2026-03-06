# Architecture

## Data Model — Core Tables

| Table | Purpose | Key FKs |
|-------|---------|---------|
| `listings` | Properties managed by a host | `host_user_id` |
| `bookings` | Calendar bookings synced from iCal | `listing_id`, `host_user_id` |
| `cleaning_events` | Scheduled cleaning jobs | `listing_id`, `booking_id`, `host_user_id`, `assigned_cleaner_id` |
| `checklist_runs` | A single execution of a checklist for an event | `cleaning_event_id` (unique), `cleaner_user_id` |
| `checklist_responses` | Per-item responses within a run | `run_id`, `item_id` |
| `checklist_photos` | Photos uploaded during a run | `run_id`, `item_id` |
| `log_hours` | Work hours (manual or checklist-created) | `checklist_run_id` (nullable), `cleaning_event_id` |
| `shopping_list` | Missing products (manual or checklist-created) | `checklist_run_id` (nullable), `submission_id` |
| `maintenance_tickets` | Maintenance reports | `checklist_run_id` (nullable) |
| `expenses` | Cost tracking | `created_by_user_id`, `host_user_id` |

## Effective Status (Single Source of Truth)

Event status is **derived** from the latest `checklist_run`:

```
CANCELLED → event.status === "CANCELLED"
COMPLETED → latest run exists && finished_at IS NOT NULL
IN_PROGRESS → latest run exists && finished_at IS NULL
TODO → no run exists
```

Use `deriveEffectiveStatus()` from `src/lib/domain/effectiveStatus.ts` everywhere.
Never trust `event.status` when a run exists.

## Reset Behavior

Reset = delete run + responses + photos + checklist-created records (by `run_id`), then event → TODO.
**No history** — at most one active run per event at a time.
Reset is performed by the `reset-cleaning-event` edge function (transactional, service-role).

## run_id Meaning

- `checklist_run_id IS NULL` → record was created manually (independent form)
- `checklist_run_id IS NOT NULL` → record was created during checklist wizard
- On reset, records with matching `run_id` are deleted

## Multi-Host Cleaner Scoping

A cleaner can belong to multiple hosts via `cleaner_assignments`.
**Rule:** Any write scoped to a cleaning event MUST use `event.host_user_id`, NOT the derived `hostId` from `useAuth()`.
Use `getEventHostId()` from `src/lib/domain/eventScope.ts`.

## iCal Sync & Cancellation

- `sync-ics` fetches iCal feeds and upserts bookings + cleaning events
- `last_seen_at` on bookings tracks when a booking was last present in the feed
- `STATUS:CANCELLED` VEVENTs → booking cancelled → event cancelled
- Grace window (48h) for bookings not seen → soft cancel

## Security

- RLS: owner-scoped (`host_user_id = auth.uid()`) on all tables
- Edge functions: JWT + CRON_SECRET gating
- Storage: user-scoped folders, private buckets, signed URLs at read-time
