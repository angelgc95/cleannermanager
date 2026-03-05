

## Plan: Unify Event Status + Real Host Reset

### Problem Summary
1. TasksPage (`/tasks`) shows `event.status` from DB, not derived from checklist runs
2. Host can manually set status to TODO via dropdown without actually resetting run data
3. Current reset logic uses client-side deletes that silently fail because RLS has no DELETE policies on `checklist_runs`, `checklist_responses`, etc.

### A) Derive effectiveStatus everywhere

**New hook: `src/hooks/useEffectiveStatus.ts`**
- Export a hook `useEffectiveStatuses(eventIds: string[])` that batch-fetches the latest `checklist_runs` for multiple events in one query
- Returns `Record<eventId, "TODO" | "IN_PROGRESS" | "COMPLETED">`
- Logic: for each event, find latest run by `started_at DESC` -- if finished_at is set -> COMPLETED, if null -> IN_PROGRESS, no run -> TODO

**TasksPage.tsx changes:**
- After fetching events, call `useEffectiveStatuses` with all event IDs
- Pass `effectiveStatus` to `EventCard` instead of `event.status`
- Use effectiveStatus for tab categorization (upcoming vs completed)

**TaskDetailPage.tsx** -- already uses effectiveStatus, no change needed for display.

**ChecklistRunPage.tsx** -- already queries latest run, no change needed.

### B) Remove manual status override for COMPLETED events

**TaskDetailPage.tsx changes:**
- When `effectiveStatus === "COMPLETED"` (host view), hide the status dropdown entirely
- Show a "Reset checklist (Start again)" button instead
- When `effectiveStatus === "IN_PROGRESS"`, make the status dropdown read-only or remove the TODO option (host shouldn't manually revert without reset)
- Keep dropdown functional for TODO and CANCELLED states only

### C) Edge function for reliable reset

**New edge function: `supabase/functions/reset-cleaning-event/index.ts`**
- Accepts `{ cleaning_event_id }` in POST body
- Validates JWT, extracts user ID
- Verifies caller is `host_user_id` on the event (service role query)
- Transactionally:
  1. Find all `checklist_runs` for the event
  2. Delete `checklist_photos` by run_id
  3. Delete `checklist_responses` by run_id  
  4. Delete `shopping_list` by checklist_run_id
  5. Delete `log_hours` by checklist_run_id
  6. Delete the `checklist_runs`
  7. Update `cleaning_events` set `status='TODO'`, `checklist_run_id=null`
- Returns `{ ok: true }`
- Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS

**Config update: `supabase/config.toml`**
- Add `[functions.reset-cleaning-event]` with `verify_jwt = false`

**TaskDetailPage.tsx changes:**
- Replace `handleResetConfirm` to call `supabase.functions.invoke("reset-cleaning-event", { body: { cleaning_event_id: id } })`
- On success, refresh local state and `latestRunForStatus`
- Show error toast on failure

### D) ChecklistRunPage completed screen -- host reset button

Already has "Reset & Start again" for hosts. Update it to also call the edge function instead of client-side deletes.

### Files to create/modify
1. **Create** `src/hooks/useEffectiveStatus.ts` -- batch status derivation hook
2. **Create** `supabase/functions/reset-cleaning-event/index.ts` -- service-role reset
3. **Modify** `supabase/config.toml` -- add function config
4. **Modify** `src/pages/TasksPage.tsx` -- use effectiveStatus in event list
5. **Modify** `src/pages/TaskDetailPage.tsx` -- replace dropdown with reset button when COMPLETED, use edge function for reset
6. **Modify** `src/pages/ChecklistRunPage.tsx` -- use edge function for host reset

