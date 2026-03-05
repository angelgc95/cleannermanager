

## Plan: Phase 1 — Reliability and Data Correctness

### Problem 1: Maintenance media stores signed URLs (expire after 1 hour)
`MaintenancePage.uploadPhoto()` stores a signed URL in `pic1_url`/`pic2_url` instead of the storage path. After 1 hour the URLs expire and images break.

**Fix:** Store the storage path (e.g. `maintenance/uuid.jpg`) in the DB. At read time, generate signed URLs for display.

**Changes to `src/pages/MaintenancePage.tsx`:**
- `uploadPhoto()`: return `path` (the storage path string) instead of `signedUrl`
- `fetchTickets()`: after fetching tickets, loop through `pic1_url`/`pic2_url` and generate signed URLs into a local map `signedUrls: Record<ticketId, { pic1?: string, pic2?: string }>`
- Render images using `signedUrls[t.id]?.pic1` instead of `t.pic1_url`

### Problem 2: reset-cleaning-event doesn't delete storage objects
When resetting, checklist photos are deleted from DB but orphaned in storage.

**Changes to `supabase/functions/reset-cleaning-event/index.ts`:**
- Before deleting `checklist_photos` rows, fetch `photo_url` (storage paths) for each run
- Call `serviceClient.storage.from("checklist-photos").remove([...paths])` to delete actual files
- Batch all run IDs into single `.in()` queries instead of looping one-by-one:
  ```
  .from("checklist_photos").select("photo_url").in("run_id", runIds)
  .from("checklist_photos").delete().in("run_id", runIds)
  .from("checklist_responses").delete().in("run_id", runIds)
  .from("shopping_list").delete().in("checklist_run_id", runIds)
  .from("log_hours").delete().in("checklist_run_id", runIds)
  .from("checklist_runs").delete().in("id", runIds)
  ```

### Problem 3: Dispatcher has race condition (read-then-update)
Current flow: SELECT where status=SCHEDULED, then later UPDATE to SENT. If two invocations overlap, both read the same jobs and double-send.

**Fix:** Use a DB function to atomically claim jobs via `UPDATE ... WHERE status='SCHEDULED' ... RETURNING *`.

**Migration:** Create a `claim_notification_jobs` function:
```sql
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size int DEFAULT 100)
RETURNS SETOF notification_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE notification_jobs
  SET status = 'PROCESSING', updated_at = now()
  WHERE id IN (
    SELECT id FROM notification_jobs
    WHERE status = 'SCHEDULED'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
```

**Changes to `supabase/functions/dispatch-notifications/index.ts`:**
- Replace the SELECT query with `supabase.rpc("claim_notification_jobs", { batch_size: 100 })`
- The RPC returns already-claimed rows; no other invocation can pick them up
- Add `'PROCESSING'` to the `notification_job_status` enum via migration
- On success: update to `SENT`; on skip: update to `SKIPPED`; on error: update to `FAILED`
- Fetch event data separately for claimed jobs (join via a follow-up query using the event IDs)

### Migration
Add `PROCESSING` to enum + create the claim function:
```sql
ALTER TYPE notification_job_status ADD VALUE IF NOT EXISTS 'PROCESSING';

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(...) ...;
```

### Files to modify
1. **`src/pages/MaintenancePage.tsx`** — store path, generate signed URLs at read time
2. **`supabase/functions/reset-cleaning-event/index.ts`** — delete storage objects, batch queries
3. **`supabase/functions/dispatch-notifications/index.ts`** — use atomic claim RPC
4. **New migration** — add PROCESSING enum value + claim function

