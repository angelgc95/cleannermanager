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
type EventRow = { id: string; organization_id: string; start_at: string };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

async function ensureLateStartException(
  service: any,
  organizationId: string,
  eventId: string,
) {
  const { data: existing } = await service
    .from("v1_event_exceptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .eq("type", "LATE_START")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existing?.id) return false;

  const { error } = await service
    .from("v1_event_exceptions")
    .insert({
      organization_id: organizationId,
      event_id: eventId,
      type: "LATE_START",
      severity: "HIGH",
      status: "OPEN",
      notes: "Event start is overdue and checklist has not started.",
    });

  if (error) throw error;
  return true;
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
    const lookaheadEnd = new Date(now.getTime() + lookaheadMinutes * 60 * 1000);
    const overdueCutoff = new Date(now.getTime() - overdueMinutes * 60 * 1000);

    let soonTriggered = 0;
    let overdueTriggered = 0;
    let lateExceptionsEnsured = 0;

    for (const org of orgRows) {
      const { data: soonEvents } = await service
        .from("v1_events")
        .select("id, organization_id, start_at")
        .eq("organization_id", org.id)
        .in("status", ["TODO", "IN_PROGRESS"])
        .gte("start_at", now.toISOString())
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
        .select("id, organization_id, start_at")
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

        const created = await ensureLateStartException(service, event.organization_id, event.id);
        if (created) lateExceptionsEnsured += 1;

        await invokeAutomations(supabaseUrl, serviceKey, {
          organization_id: event.organization_id,
          trigger_type: "EVENT_OVERDUE_START",
          event_id: event.id,
        });
        overdueTriggered += 1;
      }
    }

    return json(200, {
      ok: true,
      organizations_processed: orgRows.length,
      soon_triggered: soonTriggered,
      overdue_triggered: overdueTriggered,
      late_exceptions_ensured: lateExceptionsEnsured,
      lookahead_minutes: lookaheadMinutes,
      overdue_minutes: overdueMinutes,
    });
  } catch (error) {
    console.error("schedule-ops-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
