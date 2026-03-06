

## Plan: Phase 3 — Quality and Maintainability

### A) Edge Function Integration Tests

Create Deno test files for the three most critical edge functions. These tests call the deployed function endpoints and verify correct behavior.

**Files to create:**
1. `supabase/functions/reset-cleaning-event/index.test.ts` — tests auth rejection (no token), missing body, and success response format
2. `supabase/functions/dispatch-notifications/index.test.ts` — tests CRON_SECRET gating and basic invocation
3. `supabase/functions/onboard-user/index.test.ts` — tests auth rejection and invalid type handling

Each test file follows the pattern:
```typescript
import "https://deno.land/std@0.224.0/dotenv/load.ts";
// fetch the function URL, assert status codes and JSON shape
```

### B) RLS Policy Regression Tests (SQL via edge function)

Create `supabase/functions/rls-smoke-test/index.ts` — a CRON_SECRET-gated edge function that:
1. Uses service role to insert test rows into `cleaning_events`, `checklist_photos`, `maintenance_updates`
2. Creates two test JWTs (host A, host B) via service role
3. Queries as host B and asserts zero rows returned for host A's data
4. Cleans up test rows
5. Returns pass/fail JSON

This gives an invocable regression test for the Phase 0 owner-scoped RLS policies without needing a separate test framework.

### C) React Query Migration (Domain-Critical Pages)

Replace `useEffect` + `useState` fetch patterns with `useQuery` on the 4 highest-traffic pages. React Query is already installed (`@tanstack/react-query`) with a `QueryClient` in `App.tsx` but zero `useQuery` calls exist.

**Pages to migrate:**

1. **`src/pages/Dashboard.tsx`** — Extract 3 fetches (today's events, stats counts, tasks) into `useQuery` hooks. Mutations for create/complete/delete task use `useMutation` with `queryClient.invalidateQueries`.

2. **`src/pages/CalendarPage.tsx`** — Events fetch keyed by `["calendar-events", currentMonth]`. Suggestions fetch keyed by `["pricing-suggestions", currentMonth]`. Both auto-refetch on month change.

3. **`src/pages/TaskDetailPage.tsx`** — Event detail fetch keyed by `["event", id]`. Checklist run, photos, shopping items as dependent queries.

4. **`src/pages/ShoppingPage.tsx`** — Products and shopping list as `useQuery`. Submit/clear actions as `useMutation` with invalidation.

**Pattern for each page:**
```typescript
// Before:
const [data, setData] = useState([]);
useEffect(() => { fetchData().then(setData); }, [dep]);

// After:
const { data = [] } = useQuery({
  queryKey: ["entity", dep],
  queryFn: async () => { /* fetch */ },
});
```

Mutations use:
```typescript
const mutation = useMutation({
  mutationFn: async (args) => { /* insert/update/delete */ },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity"] }),
});
```

### D) Replace `any` in Domain-Critical Paths

Define proper TypeScript interfaces for the most-used data shapes to catch bugs at compile time:

**`src/types/domain.ts`** (new file) — Export interfaces:
- `CleaningEvent` (id, listing_id, host_user_id, status, start_at, end_at, assigned_cleaner_id, etc.)
- `MaintenanceTicket` (id, issue, status, pic1_url, pic2_url, etc.)
- `ShoppingListItem` (id, product_id, status, quantity_needed, etc.)
- `TaskItem` (already partially defined in Dashboard — extract and share)

Apply these types in the 4 migrated pages, replacing `any[]` state declarations.

### Summary of Files

| Action | File |
|--------|------|
| Create | `supabase/functions/reset-cleaning-event/index.test.ts` |
| Create | `supabase/functions/dispatch-notifications/index.test.ts` |
| Create | `supabase/functions/onboard-user/index.test.ts` |
| Create | `supabase/functions/rls-smoke-test/index.ts` |
| Create | `src/types/domain.ts` |
| Edit | `src/pages/Dashboard.tsx` |
| Edit | `src/pages/CalendarPage.tsx` |
| Edit | `src/pages/TaskDetailPage.tsx` |
| Edit | `src/pages/ShoppingPage.tsx` |
| Edit | `supabase/config.toml` (add rls-smoke-test with verify_jwt=false) |

