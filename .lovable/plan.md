

## Plan: Phase 2 — Performance Optimization

### A) Database Indexes (single migration)

Add all critical indexes to eliminate sequential scans on hot query paths:

```sql
-- cleaning_events
CREATE INDEX IF NOT EXISTS idx_cleaning_events_host_start ON cleaning_events(host_user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_events_cleaner_start ON cleaning_events(assigned_cleaner_id, start_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_events_listing_status ON cleaning_events(listing_id, status);

-- notification_jobs (partial index for dispatcher)
CREATE INDEX IF NOT EXISTS idx_notification_jobs_scheduled ON notification_jobs(status, scheduled_for)
  WHERE status = 'SCHEDULED';

-- in_app_notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON in_app_notifications(user_id, created_at DESC);

-- log_hours
CREATE INDEX IF NOT EXISTS idx_log_hours_host_user_date ON log_hours(host_user_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_log_hours_payout ON log_hours(payout_id);

-- shopping_list
CREATE INDEX IF NOT EXISTS idx_shopping_list_host_status ON shopping_list(host_user_id, status, created_at);

-- cleaner_assignments
CREATE INDEX IF NOT EXISTS idx_cleaner_assignments_host_cleaner ON cleaner_assignments(host_user_id, cleaner_user_id);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_host_created ON tasks(host_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_cleaner_status ON tasks(assigned_cleaner_id, status, created_at DESC);
```

### B) Bulk template assignment propagation

**`src/pages/TasksPage.tsx` — `handleSaveAssignments`**: Currently loops through `pendingAssignments` with sequential awaits. Replace with parallel `Promise.all` — each listing update + event propagation pair runs concurrently.

### C) Bulk payout period deletion

**`src/pages/PayoutsPage.tsx` — `handleDeletePeriod`**: Currently loops row-by-row unlinking log_hours and deleting payouts. Replace with:
1. Get all payout IDs in one query (already done)
2. Bulk unlink: `supabase.from("log_hours").update({ payout_id: null }).in("payout_id", payoutIds)`
3. Bulk delete: `supabase.from("payouts").delete().eq("period_id", periodId)`
4. Delete period

### D) Payout generation — batch orphan run inserts

**`supabase/functions/generate-payouts/index.ts`**: The inner loop inserts `log_hours` one-by-one per orphan run. Replace with a single bulk `.insert([...rows])` per cleaner.

### E) Optimize useEffectiveStatuses hook

**`src/hooks/useEffectiveStatus.ts`**: Currently O(n*m) — for each eventId, `.find()` scans the runs array. Fix:
1. Build a `Map<eventId, latestRun>` in a single pass over the sorted runs array
2. Then iterate eventIds once to derive status from the map

This is a client-side O(n) fix. Moving the latest-run calc to SQL (a DB function with `DISTINCT ON`) would be a further optimization, but the current query volume doesn't warrant it yet — the O(n) map fix eliminates the bottleneck.

### Files
1. **New migration** — all indexes
2. **`src/pages/TasksPage.tsx`** — `Promise.all` in `handleSaveAssignments`
3. **`src/pages/PayoutsPage.tsx`** — bulk unlink + delete in `handleDeletePeriod`
4. **`supabase/functions/generate-payouts/index.ts`** — batch orphan run inserts
5. **`src/hooks/useEffectiveStatus.ts`** — O(n) map-based status derivation

