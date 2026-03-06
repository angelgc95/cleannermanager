import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
};

type Payload = {
  organization_id?: string;
  week_start?: string;
};

type OrgRow = { id: string };
type UnitRow = { id: string; parent_id: string | null };
type ListingRow = { id: string; unit_id: string };
type EventRow = { id: string; listing_id: string; start_at: string; status: string };
type RunRow = { id: string; event_id: string; started_at: string | null };
type QaRow = { run_id: string; status: "PENDING" | "APPROVED" | "REJECTED" };
type HoursRow = { event_id: string | null; minutes: number };
type ExceptionRow = { event_id: string };

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function startOfWeekDate(input?: string) {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

function collectDescendantUnitIds(units: UnitRow[], rootId: string) {
  const childrenByParent = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parent_id) continue;
    const current = childrenByParent.get(unit.parent_id) || [];
    current.push(unit.id);
    childrenByParent.set(unit.parent_id, current);
  }

  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const unitId = queue.shift();
    if (!unitId) continue;
    for (const childId of childrenByParent.get(unitId) || []) {
      if (result.has(childId)) continue;
      result.add(childId);
      queue.push(childId);
    }
  }

  return result;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let idx = 0; idx < items.length; idx += size) {
    chunks.push(items.slice(idx, idx + size));
  }
  return chunks;
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

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const weekStart = startOfWeekDate(payload.week_start);
    const weekEnd = new Date(`${weekStart}T00:00:00.000Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const service = createClient(supabaseUrl, serviceKey);

    let orgs: OrgRow[] = [];
    if (payload.organization_id) {
      orgs = [{ id: payload.organization_id }];
    } else {
      const { data } = await service.from("v1_organizations").select("id").order("created_at", { ascending: true });
      orgs = (data || []) as OrgRow[];
    }

    let rowsWritten = 0;

    for (const org of orgs) {
      const [{ data: units }, { data: listings }, { data: events }, { data: hours }, { data: exceptions }] = await Promise.all([
        service.from("v1_org_units").select("id, parent_id").eq("organization_id", org.id),
        service.from("v1_listings").select("id, unit_id").eq("organization_id", org.id),
        service.from("v1_events").select("id, listing_id, start_at, status").eq("organization_id", org.id).gte("start_at", `${weekStart}T00:00:00.000Z`).lt("start_at", weekEnd.toISOString()),
        service.from("v1_hours_entries").select("event_id, minutes").eq("organization_id", org.id).gte("created_at", `${weekStart}T00:00:00.000Z`).lt("created_at", weekEnd.toISOString()),
        service.from("v1_event_exceptions").select("event_id").eq("organization_id", org.id).gte("created_at", `${weekStart}T00:00:00.000Z`).lt("created_at", weekEnd.toISOString()),
      ]);

      const unitRows = (units || []) as UnitRow[];
      const listingRows = (listings || []) as ListingRow[];
      const eventRows = (events || []) as EventRow[];
      const hoursRows = (hours || []) as HoursRow[];
      const exceptionRows = (exceptions || []) as ExceptionRow[];

      const eventIds = eventRows.map((event) => event.id);
      let runRows: RunRow[] = [];
      let qaRows: QaRow[] = [];

      if (eventIds.length > 0) {
        const { data: runs } = await service.from("v1_checklist_runs").select("id, event_id, started_at").eq("organization_id", org.id).in("event_id", eventIds);
        runRows = (runs || []) as RunRow[];

        const runIds = runRows.map((run) => run.id);
        if (runIds.length > 0) {
          const { data: qas } = await service.from("v1_qa_reviews").select("run_id, status").eq("organization_id", org.id).in("run_id", runIds);
          qaRows = (qas || []) as QaRow[];
        }
      }

      const runByEventId = new Map<string, RunRow>();
      for (const run of runRows) {
        runByEventId.set(run.event_id, run);
      }

      const qaByRunId = new Map<string, QaRow>();
      for (const qa of qaRows) {
        qaByRunId.set(qa.run_id, qa);
      }

      const rowsToUpsert = unitRows.map((unit) => {
        const scope = collectDescendantUnitIds(unitRows, unit.id);
        const listingIds = new Set(listingRows.filter((listing) => scope.has(listing.unit_id)).map((listing) => listing.id));
        const eventsInScope = eventRows.filter((event) => listingIds.has(event.listing_id));
        const eventIdsInScope = new Set(eventsInScope.map((event) => event.id));

        let onTimeNumerator = 0;
        let onTimeDenominator = 0;
        for (const event of eventsInScope) {
          const run = runByEventId.get(event.id);
          if (!run?.started_at) continue;
          onTimeDenominator += 1;
          const startedAt = new Date(run.started_at).getTime();
          const allowedStart = new Date(event.start_at).getTime() + 15 * 60 * 1000;
          if (startedAt <= allowedStart) {
            onTimeNumerator += 1;
          }
        }

        let qaRejectNumerator = 0;
        let qaRejectDenominator = 0;
        for (const run of runRows) {
          if (!eventIdsInScope.has(run.event_id)) continue;
          const qa = qaByRunId.get(run.id);
          if (!qa || qa.status === "PENDING") continue;
          qaRejectDenominator += 1;
          if (qa.status === "REJECTED") qaRejectNumerator += 1;
        }

        const completed = eventsInScope.filter((event) => event.status === "COMPLETED").length;
        const totalMinutes = hoursRows
          .filter((row) => row.event_id && eventIdsInScope.has(row.event_id))
          .reduce((sum, row) => sum + Number(row.minutes || 0), 0);
        const exceptionsCount = exceptionRows.filter((row) => eventIdsInScope.has(row.event_id)).length;
        const eventCount = eventsInScope.length;

        return {
          organization_id: org.id,
          unit_id: unit.id,
          week_start: weekStart,
          metrics: {
            turnoversCompleted: completed,
            onTimePercent: onTimeDenominator === 0 ? 0 : (onTimeNumerator / onTimeDenominator) * 100,
            qaRejectRate: qaRejectDenominator === 0 ? 0 : (qaRejectNumerator / qaRejectDenominator) * 100,
            avgMinutesPerTurnover: completed === 0 ? 0 : totalMinutes / completed,
            exceptionsPer100Events: eventCount === 0 ? 0 : (exceptionsCount / eventCount) * 100,
            eventCount,
          },
          computed_at: new Date().toISOString(),
        };
      });

      for (const rowChunk of chunk(rowsToUpsert, 200)) {
        const { error } = await service
          .from("v1_unit_weekly_stats")
          .upsert(rowChunk, { onConflict: "organization_id,unit_id,week_start" });

        if (error) throw error;
        rowsWritten += rowChunk.length;
      }
    }

    return json(200, {
      ok: true,
      organizations_processed: orgs.length,
      rows_written: rowsWritten,
      week_start: weekStart,
    });
  } catch (error) {
    console.error("compute-stats-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
