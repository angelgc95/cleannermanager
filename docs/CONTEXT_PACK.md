# Context Pack — Cleaning Manager App

## What This App Does

A cleaning operations manager for short-term rental hosts. Hosts manage listings,
sync bookings from Airbnb/Booking.com via iCal, and assign cleaning tasks to cleaners.
Cleaners execute checklists, log hours, report maintenance, and flag missing supplies.

## Core Flows

### 1. Booking Sync
- Host provides iCal URLs per listing (Airbnb, Booking.com, Other)
- `sync-ics` edge function fetches feeds, upserts bookings, creates cleaning events on check-in day
- Confirmation codes extracted from Airbnb iCal descriptions used as event references

### 2. Cleaning Event Lifecycle
```
TODO → IN_PROGRESS (cleaner starts checklist) → COMPLETED (checklist finished) → [Reset] → TODO
                                                                                → CANCELLED
```

### 3. Checklist Wizard
Wizard tabs: Clock In → Section 1..N → Shopping Check → Clock Out → Finish
On finish:
- Saves checklist responses
- Creates `log_hours` entry with `source=CHECKLIST`, `checklist_run_id=<run>`
- Creates `shopping_list` entries with `created_from=CHECKLIST`, `checklist_run_id=<run>`
- Updates event status to DONE

### 4. Independent Forms
These tables accept both checklist-created AND manual submissions:
- `log_hours` (manual: `checklist_run_id=NULL`, `source=MANUAL`)
- `shopping_list` (manual: `checklist_run_id=NULL`, `created_from=MANUAL`)
- `maintenance_tickets` (manual: `checklist_run_id=NULL`)
- `expenses` (always manual, no run linkage)

### 5. Reset
Host triggers reset via `reset-cleaning-event` edge function:
- Deletes: photos (storage + DB), responses, shopping items by run_id, log_hours by run_id, checklist_runs
- Resets event status to TODO, clears checklist_run_id
- Cleaner can then start fresh

### 6. Payouts
- `generate-payouts` edge function creates payout periods
- Links `log_hours` to payouts
- Auto-creates `log_hours` from orphan checklist runs (completed but no log entry)

## Data Contract

### Effective Status
Derived from latest `checklist_run` for the event (see ARCHITECTURE.md).

### Host Scoping
All event-related writes use `event.host_user_id`, not derived `hostId`.

### run_id Convention
- NULL = manual submission
- NOT NULL = created via checklist wizard
- Reset deletes records matching run_id

## Roles
- `host`: Manages listings, templates, cleaners, payouts
- `cleaner`: Executes checklists, logs hours, reports issues
