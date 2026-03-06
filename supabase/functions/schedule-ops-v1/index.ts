import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
};

type SchedulerPayload = {
  organization_id?: string;
  lookahead_minutes?: number;
  overdue_minutes?: number;
  enable_cleaner_reminders?: boolean;
};

type OrgRow = { id: string };

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  start_at: string;
  end_at: string;
  ready_by_override_at: string | null;
  status: string;
};

type ChecklistRunRow = {
  id: string;
  event_id: string;
  status: string;
  started_at: string | null;
};

type QaReviewRow = {
  run_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type ListingRow = {
  id: string;
  unit_id: string;
  name: string;
  timezone: string;
};

type ReminderStateRow = {
  event_id: string;
  last_reminder_60_at: string | null;
  last_reminder_30_at: string | null;
  last_reminder_15_at: string | null;
};

type ExceptionRow = {
  id: string;
  organization_id: string;
  event_id: string;
  type: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  escalation_level: number;
  next_escalation_at: string | null;
};

type RoleAssignment = {
  user_id: string;
  scope_type: "ORG" | "UNIT" | "LISTING";
  scope_id: string | null;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeZone(input: string | null | undefined): string {
  const candidate = (input || "").trim() || "UTC";
  return isValidTimeZone(candidate) ? candidate : "UTC";
}

function formatDeadlineLocal(deadlineIso: string, listingTimeZone: string): string {
  const timeZone = normalizeTimeZone(listingTimeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(deadlineIso));
}

function getEventDeadlineIso(event: EventRow): string {
  return event.ready_by_override_at || event.end_at;
}

function isWithinReminderWindow(deadlineMs: number, nowMs: number, targetMinutes: number): boolean {
  const diffMs = deadlineMs - nowMs;
  const upper = targetMinutes * 60 * 1000;
  const lower = (targetMinutes - 1) * 60 * 1000;
  return diffMs <= upper && diffMs >= lower;
}

function reminderFieldForTarget(targetMinutes: 60 | 30 | 15): keyof ReminderStateRow {
  if (targetMinutes === 60) return "last_reminder_60_at";
  if (targetMinutes === 30) return "last_reminder_30_at";
  return "last_reminder_15_at";
}

function isEventReady(
  run: ChecklistRunRow | undefined,
  qaReview: QaReviewRow | undefined,
): boolean {
  if (!run) return false;
  if (run.status === "COMPLETED") return true;
  if (qaReview?.status === "APPROVED") return true;
  return false;
}

async function hasRecentUnreadReminder(
  service: any,
  args: {
    organizationId: string;
    eventId: string;
    recipientUserId: string;
    title: string;
    cutoffIso: string;
  },
): Promise<boolean> {
  const { count } = await service
    .from("v1_notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", args.organizationId)
    .eq("event_id", args.eventId)
    .eq("recipient_user_id", args.recipientUserId)
    .eq("title", args.title)
    .is("read_at", null)
    .gte("created_at", args.cutoffIso);

  return (count || 0) > 0;
}

async function invokeAutomations(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/run-automations-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-internal-service-key": serviceKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("schedule-ops-v1 automation invoke failed", response.status, body);
    }
  } catch (error) {
    console.warn("schedule-ops-v1 automation invoke error", error);
  }
}

async function ensureException(
  service: any,
  args: {
    organizationId: string;
    eventId: string;
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    notes: string;
    nowIso: string;
  },
): Promise<{ row: ExceptionRow; created: boolean }> {
  const { data: existing } = await service
    .from("v1_event_exceptions")
    .select("id, organization_id, event_id, type, status, escalation_level, next_escalation_at")
    .eq("organization_id", args.organizationId)
    .eq("event_id", args.eventId)
    .eq("type", args.type)
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existing) {
    return { row: existing as ExceptionRow, created: false };
  }

  const { data, error } = await service
    .from("v1_event_exceptions")
    .insert({
      organization_id: args.organizationId,
      event_id: args.eventId,
      type: args.type,
      severity: args.severity,
      status: "OPEN",
      notes: args.notes,
      escalation_level: 0,
      next_escalation_at: args.nowIso,
    })
    .select("id, organization_id, event_id, type, status, escalation_level, next_escalation_at")
    .single();

  if (error || !data) {
    throw error || new Error("Failed to ensure exception");
  }

  return { row: data as ExceptionRow, created: true };
}

async function getUnitChain(service: any, organizationId: string, unitId: string | null): Promise<string[]> {
  if (!unitId) return [];

  const chain: string[] = [];
  let current = unitId;
  let guard = 0;

  while (current && guard < 16) {
    guard += 1;

    const { data } = await service
      .from("v1_org_units")
      .select("id, parent_id")
      .eq("organization_id", organizationId)
      .eq("id", current)
      .maybeSingle();

    if (!data?.id) break;

    chain.push(data.id);
    current = data.parent_id || "";
  }

  return chain;
}

async function resolveEscalationRecipient(
  service: any,
  args: {
    organizationId: string;
    unitChain: string[];
    escalationLevel: number;
  },
): Promise<string | null> {
  const [{ data: unitAssignments }, { data: orgAssignments }, { data: managerMembers }, { data: adminOwnerMembers }] = await Promise.all([
    service
      .from("v1_role_assignments")
      .select("user_id, scope_type, scope_id")
      .eq("organization_id", args.organizationId)
      .eq("role", "MANAGER")
      .eq("scope_type", "UNIT")
      .in("scope_id", args.unitChain.length > 0 ? args.unitChain : ["00000000-0000-0000-0000-000000000000"]),
    service
      .from("v1_role_assignments")
      .select("user_id, scope_type, scope_id")
      .eq("organization_id", args.organizationId)
      .eq("role", "MANAGER")
      .eq("scope_type", "ORG"),
    service
      .from("v1_organization_members")
      .select("user_id")
      .eq("organization_id", args.organizationId)
      .eq("role", "MANAGER"),
    service
      .from("v1_organization_members")
      .select("user_id")
      .eq("organization_id", args.organizationId)
      .in("role", ["OWNER", "ORG_ADMIN"]),
  ]);

  const unitScoped = (unitAssignments || []) as RoleAssignment[];
  const orgScoped = (orgAssignments || []) as RoleAssignment[];

  const buckets: string[][] = [];

  for (const unitId of args.unitChain) {
    const unitUsers = uniq(unitScoped.filter((row) => row.scope_id === unitId).map((row) => row.user_id));
    buckets.push(unitUsers);
  }

  const orgManagers = uniq([
    ...orgScoped.map((row) => row.user_id),
    ...(managerMembers || []).map((row: { user_id: string }) => row.user_id),
  ]);
  buckets.push(orgManagers);

  const ownerAdmins = uniq((adminOwnerMembers || []).map((row: { user_id: string }) => row.user_id));
  buckets.push(ownerAdmins);

  const startIndex = Math.max(0, Math.min(args.escalationLevel, Math.max(0, buckets.length - 1)));

  for (let idx = startIndex; idx < buckets.length; idx += 1) {
    const bucket = buckets[idx] || [];
    if (bucket.length === 0) continue;
    const userIndex = args.escalationLevel % bucket.length;
    return bucket[userIndex] || bucket[0] || null;
  }

  for (const bucket of buckets) {
    if (bucket.length > 0) return bucket[0];
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim() || "";
    const internalHeader = req.headers.get("x-internal-service-key") || "";
    if (bearer !== serviceKey && internalHeader !== serviceKey) {
      return json(401, { error: "Internal service auth required" });
    }

    const payload = (await req.json().catch(() => ({}))) as SchedulerPayload;
    const lookaheadMinutes = Math.max(1, Number(payload.lookahead_minutes ?? 60));
    const overdueMinutes = Math.max(1, Number(payload.overdue_minutes ?? 15));
    const enableCleanerReminders = payload.enable_cleaner_reminders ?? true;

    const service = createClient(supabaseUrl, serviceKey);

    let orgRows: OrgRow[] = [];
    if (payload.organization_id) {
      orgRows = [{ id: payload.organization_id }];
    } else {
      const { data } = await service
        .from("v1_organizations")
        .select("id")
        .order("created_at", { ascending: true });
      orgRows = (data || []) as OrgRow[];
    }

    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const lookaheadEnd = new Date(nowMs + lookaheadMinutes * 60 * 1000);
    const overdueCutoff = new Date(nowMs - overdueMinutes * 60 * 1000);

    let soonTriggered = 0;
    let overdueTriggered = 0;
    let lateExceptionsEnsured = 0;
    let missingChecklistEnsured = 0;
    let missingChecklistEscalations = 0;
    let cleanerRemindersSent = 0;

    for (const org of orgRows) {
      const { data: soonEvents } = await service
        .from("v1_events")
        .select("id, organization_id, listing_id, assigned_cleaner_id, start_at, end_at, ready_by_override_at, status")
        .eq("organization_id", org.id)
        .in("status", ["TODO", "IN_PROGRESS"])
        .gte("start_at", nowIso)
        .lte("start_at", lookaheadEnd.toISOString())
        .order("start_at", { ascending: true })
        .limit(1000);

      for (const event of (soonEvents || []) as EventRow[]) {
        await invokeAutomations(supabaseUrl, serviceKey, {
          organization_id: event.organization_id,
          trigger_type: "EVENT_STARTING_SOON",
          event_id: event.id,
        });
        soonTriggered += 1;
      }

      const { data: overdueCandidates } = await service
        .from("v1_events")
        .select("id, organization_id, listing_id, assigned_cleaner_id, start_at, end_at, ready_by_override_at, status")
        .eq("organization_id", org.id)
        .eq("status", "TODO")
        .lt("start_at", overdueCutoff.toISOString())
        .order("start_at", { ascending: true })
        .limit(1000);

      for (const event of (overdueCandidates || []) as EventRow[]) {
        const { data: run } = await service
          .from("v1_checklist_runs")
          .select("id, started_at")
          .eq("event_id", event.id)
          .maybeSingle();

        if (run?.started_at) continue;

        const ensured = await ensureException(service, {
          organizationId: event.organization_id,
          eventId: event.id,
          type: "LATE_START",
          severity: "HIGH",
          notes: "Event start is overdue and checklist has not started.",
          nowIso,
        });
        if (ensured.created) lateExceptionsEnsured += 1;

        await invokeAutomations(supabaseUrl, serviceKey, {
          organization_id: event.organization_id,
          trigger_type: "EVENT_OVERDUE_START",
          event_id: event.id,
        });
        overdueTriggered += 1;
      }

      if (enableCleanerReminders) {
        const reminderPastCutoffIso = new Date(nowMs - 70 * 60 * 1000).toISOString();

        const { data: reminderCandidates } = await service
          .from("v1_events")
          .select("id, organization_id, listing_id, assigned_cleaner_id, start_at, end_at, ready_by_override_at, status")
          .eq("organization_id", org.id)
          .in("status", ["TODO", "IN_PROGRESS"])
          .not("assigned_cleaner_id", "is", null)
          .or(`end_at.gte.${reminderPastCutoffIso},ready_by_override_at.not.is.null`)
          .order("end_at", { ascending: true })
          .limit(2000);

        const reminderRows = (reminderCandidates || []) as EventRow[];
        if (reminderRows.length > 0) {
          const eventIds = reminderRows.map((row) => row.id);
          const listingIds = uniq(reminderRows.map((row) => row.listing_id));

          const [{ data: runRows }, { data: listingRows }, { data: reminderStates }] = await Promise.all([
            service
              .from("v1_checklist_runs")
              .select("id, event_id, status, started_at")
              .in("event_id", eventIds),
            service
              .from("v1_listings")
              .select("id, unit_id, name, timezone")
              .in("id", listingIds),
            service
              .from("v1_event_reminder_state")
              .select("event_id, last_reminder_60_at, last_reminder_30_at, last_reminder_15_at")
              .in("event_id", eventIds),
          ]);

          const runsByEventId = new Map<string, ChecklistRunRow>();
          for (const run of (runRows || []) as ChecklistRunRow[]) {
            runsByEventId.set(run.event_id, run);
          }

          const runIds = uniq((runRows || []).map((row: ChecklistRunRow) => row.id));
          const qaByRunId = new Map<string, QaReviewRow>();
          if (runIds.length > 0) {
            const { data: qaRows } = await service
              .from("v1_qa_reviews")
              .select("run_id, status")
              .in("run_id", runIds);

            for (const qaRow of (qaRows || []) as QaReviewRow[]) {
              qaByRunId.set(qaRow.run_id, qaRow);
            }
          }

          const listingById = new Map<string, ListingRow>();
          for (const listing of (listingRows || []) as ListingRow[]) {
            listingById.set(listing.id, listing);
          }

          const reminderStateByEventId = new Map<string, ReminderStateRow>();
          for (const state of (reminderStates || []) as ReminderStateRow[]) {
            reminderStateByEventId.set(state.event_id, state);
          }

          const reminderSafetyCutoffIso = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();

          for (const event of reminderRows) {
            if (!event.assigned_cleaner_id) continue;

            const run = runsByEventId.get(event.id);
            const qa = run ? qaByRunId.get(run.id) : undefined;
            if (isEventReady(run, qa)) {
              continue;
            }

            const deadlineIso = getEventDeadlineIso(event);
            const deadlineMs = new Date(deadlineIso).getTime();
            if (Number.isNaN(deadlineMs)) continue;

            const listing = listingById.get(event.listing_id);
            const localDeadline = formatDeadlineLocal(deadlineIso, listing?.timezone || "UTC");
            const listingName = listing?.name || `Listing ${event.listing_id}`;

            const existingState = reminderStateByEventId.get(event.id) || {
              event_id: event.id,
              last_reminder_60_at: null,
              last_reminder_30_at: null,
              last_reminder_15_at: null,
            };

            const nextState: ReminderStateRow = {
              ...existingState,
            };

            for (const targetMinutes of [60, 30, 15] as const) {
              if (!isWithinReminderWindow(deadlineMs, nowMs, targetMinutes)) {
                continue;
              }

              const field = reminderFieldForTarget(targetMinutes);
              if (nextState[field]) {
                continue;
              }

              const title = `Turnover due in ${targetMinutes} minutes`;

              const recentUnreadExists = await hasRecentUnreadReminder(service, {
                organizationId: event.organization_id,
                eventId: event.id,
                recipientUserId: event.assigned_cleaner_id,
                title,
                cutoffIso: reminderSafetyCutoffIso,
              });

              if (recentUnreadExists) {
                continue;
              }

              const { error: notificationError } = await service
                .from("v1_notifications")
                .insert({
                  organization_id: event.organization_id,
                  recipient_user_id: event.assigned_cleaner_id,
                  event_id: event.id,
                  type: "SYSTEM",
                  title,
                  body: `${listingName} is due by ${localDeadline}.`,
                });

              if (notificationError) {
                throw notificationError;
              }

              nextState[field] = nowIso;
              cleanerRemindersSent += 1;
            }

            if (
              nextState.last_reminder_60_at !== existingState.last_reminder_60_at
              || nextState.last_reminder_30_at !== existingState.last_reminder_30_at
              || nextState.last_reminder_15_at !== existingState.last_reminder_15_at
            ) {
              const { error: stateError } = await service
                .from("v1_event_reminder_state")
                .upsert({
                  organization_id: event.organization_id,
                  event_id: event.id,
                  last_reminder_60_at: nextState.last_reminder_60_at,
                  last_reminder_30_at: nextState.last_reminder_30_at,
                  last_reminder_15_at: nextState.last_reminder_15_at,
                }, { onConflict: "event_id" });

              if (stateError) {
                throw stateError;
              }

              reminderStateByEventId.set(event.id, nextState);
            }
          }
        }
      }

      const { data: endedEvents } = await service
        .from("v1_events")
        .select("id, organization_id, listing_id, assigned_cleaner_id, start_at, end_at, ready_by_override_at, status")
        .eq("organization_id", org.id)
        .neq("status", "CANCELLED")
        .or(`end_at.lte.${nowIso},ready_by_override_at.not.is.null`)
        .order("end_at", { ascending: true })
        .limit(2000);

      const endedRows = ((endedEvents || []) as EventRow[]).filter((row) => {
        const deadlineIso = getEventDeadlineIso(row);
        const deadlineMs = new Date(deadlineIso).getTime();
        if (Number.isNaN(deadlineMs)) return false;
        return deadlineMs <= nowMs;
      });

      if (endedRows.length === 0) continue;

      const eventIds = endedRows.map((row) => row.id);
      const listingIds = uniq(endedRows.map((row) => row.listing_id));

      const [{ data: runRows }, { data: listingRows }] = await Promise.all([
        service
          .from("v1_checklist_runs")
          .select("id, event_id, status, started_at")
          .in("event_id", eventIds),
        service
          .from("v1_listings")
          .select("id, unit_id, name, timezone")
          .in("id", listingIds),
      ]);

      const runsByEventId = new Map<string, ChecklistRunRow>();
      for (const run of (runRows || []) as ChecklistRunRow[]) {
        runsByEventId.set(run.event_id, run);
      }

      const unitByListingId = new Map<string, string>();
      for (const listing of (listingRows || []) as ListingRow[]) {
        unitByListingId.set(listing.id, listing.unit_id);
      }

      for (const event of endedRows) {
        const run = runsByEventId.get(event.id);
        if (run?.status === "COMPLETED") continue;

        const ensured = await ensureException(service, {
          organizationId: event.organization_id,
          eventId: event.id,
          type: "MISSING_CHECKLIST",
          severity: "HIGH",
          notes: "Event ended without a completed checklist.",
          nowIso,
        });

        if (ensured.created) missingChecklistEnsured += 1;

        const exception = ensured.row;
        if (exception.status === "ACKNOWLEDGED") {
          continue;
        }

        if (exception.status !== "OPEN") {
          continue;
        }

        const nextEscalationAt = exception.next_escalation_at ? new Date(exception.next_escalation_at) : now;
        if (nextEscalationAt.getTime() > nowMs) {
          continue;
        }

        const unitId = unitByListingId.get(event.listing_id) || null;
        const unitChain = await getUnitChain(service, event.organization_id, unitId);
        const recipient = await resolveEscalationRecipient(service, {
          organizationId: event.organization_id,
          unitChain,
          escalationLevel: Number(exception.escalation_level || 0),
        });

        if (!recipient) {
          continue;
        }

        const level = Number(exception.escalation_level || 0);
        const nowTs = new Date();
        const nextEscalation = new Date(nowTs.getTime() + 15 * 60 * 1000);

        const { error: notificationError } = await service
          .from("v1_notifications")
          .insert({
            organization_id: event.organization_id,
            recipient_user_id: recipient,
            event_id: event.id,
            exception_id: exception.id,
            type: "EXCEPTION",
            title: `Checklist missing for event ${event.id.slice(0, 8)}`,
            body: `Escalation level ${level + 1}: checklist is still not completed after event end.`,
          });

        if (notificationError) {
          throw notificationError;
        }

        const { error: updateError } = await service
          .from("v1_event_exceptions")
          .update({
            escalation_level: level + 1,
            last_notified_at: nowTs.toISOString(),
            next_escalation_at: nextEscalation.toISOString(),
          })
          .eq("id", exception.id)
          .eq("status", "OPEN");

        if (updateError) {
          throw updateError;
        }

        missingChecklistEscalations += 1;
      }
    }

    return json(200, {
      ok: true,
      organizations_processed: orgRows.length,
      soon_triggered: soonTriggered,
      overdue_triggered: overdueTriggered,
      late_exceptions_ensured: lateExceptionsEnsured,
      missing_checklist_ensured: missingChecklistEnsured,
      missing_checklist_escalations: missingChecklistEscalations,
      cleaner_reminders_sent: cleanerRemindersSent,
      enable_cleaner_reminders: enableCleanerReminders,
      lookahead_minutes: lookaheadMinutes,
      overdue_minutes: overdueMinutes,
    });
  } catch (error) {
    console.error("schedule-ops-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
