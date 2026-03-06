import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
};

type SchedulerPayload = {
  organization_id?: string;
  lookahead_minutes?: number;
  overdue_minutes?: number;
};

type OrgRow = { id: string };

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  start_at: string;
  end_at: string;
  status: string;
};

type ChecklistRunRow = {
  event_id: string;
  status: string;
  started_at: string | null;
};

type ListingRow = {
  id: string;
  unit_id: string;
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
    const nowIso = now.toISOString();
    const lookaheadEnd = new Date(now.getTime() + lookaheadMinutes * 60 * 1000);
    const overdueCutoff = new Date(now.getTime() - overdueMinutes * 60 * 1000);

    let soonTriggered = 0;
    let overdueTriggered = 0;
    let lateExceptionsEnsured = 0;
    let missingChecklistEnsured = 0;
    let missingChecklistEscalations = 0;

    for (const org of orgRows) {
      const { data: soonEvents } = await service
        .from("v1_events")
        .select("id, organization_id, listing_id, start_at, end_at, status")
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
        .select("id, organization_id, listing_id, start_at, end_at, status")
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

      const { data: endedEvents } = await service
        .from("v1_events")
        .select("id, organization_id, listing_id, start_at, end_at, status")
        .eq("organization_id", org.id)
        .neq("status", "CANCELLED")
        .lte("end_at", nowIso)
        .order("end_at", { ascending: true })
        .limit(1500);

      const endedRows = (endedEvents || []) as EventRow[];
      if (endedRows.length === 0) continue;

      const eventIds = endedRows.map((row) => row.id);
      const listingIds = uniq(endedRows.map((row) => row.listing_id));

      const [{ data: runRows }, { data: listingRows }] = await Promise.all([
        service
          .from("v1_checklist_runs")
          .select("event_id, status, started_at")
          .in("event_id", eventIds),
        service
          .from("v1_listings")
          .select("id, unit_id")
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
        if (nextEscalationAt.getTime() > now.getTime()) {
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
      lookahead_minutes: lookaheadMinutes,
      overdue_minutes: overdueMinutes,
    });
  } catch (error) {
    console.error("schedule-ops-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
