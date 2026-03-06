import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type UnitRow = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
};

type ListingRow = {
  id: string;
  unit_id: string;
};

type EventRow = {
  id: string;
  listing_id: string;
  start_at: string;
  status: string;
};

type RunRow = {
  id: string;
  event_id: string;
  started_at: string;
};

type QaRow = {
  run_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type HoursRow = {
  event_id: string | null;
  minutes: number;
};

type ExceptionRow = {
  event_id: string;
};

function startOfCurrentWeekIso() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const start = new Date(now);
  start.setDate(now.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function endOfCurrentWeekIso() {
  const start = new Date(startOfCurrentWeekIso());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end.toISOString();
}

function collectDescendantUnitIds(units: UnitRow[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parent_id) continue;
    const list = children.get(unit.parent_id) || [];
    list.push(unit.id);
    children.set(unit.parent_id, list);
  }

  const result = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length) {
    const current = queue.shift()!;
    const next = children.get(current) || [];
    for (const id of next) {
      if (result.has(id)) continue;
      result.add(id);
      queue.push(id);
    }
  }

  return result;
}

export default function ReportsPage() {
  const { organizationId } = useAuth();

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [qaRows, setQaRows] = useState<QaRow[]>([]);
  const [hoursRows, setHoursRows] = useState<HoursRow[]>([]);
  const [exceptionRows, setExceptionRows] = useState<ExceptionRow[]>([]);

  const [selectedUnitId, setSelectedUnitId] = useState<string>("ALL");

  const weekStart = startOfCurrentWeekIso();
  const weekEnd = endOfCurrentWeekIso();

  const load = async () => {
    if (!organizationId) return;

    const [{ data: unitData }, { data: listingData }, { data: eventData }, { data: hoursData }, { data: exceptionData }] = await Promise.all([
      db
        .from("v1_org_units")
        .select("id, name, type, parent_id")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      db
        .from("v1_listings")
        .select("id, unit_id")
        .eq("organization_id", organizationId),
      db
        .from("v1_events")
        .select("id, listing_id, start_at, status")
        .eq("organization_id", organizationId)
        .gte("start_at", weekStart)
        .lt("start_at", weekEnd),
      db
        .from("v1_hours_entries")
        .select("event_id, minutes")
        .eq("organization_id", organizationId)
        .gte("created_at", weekStart)
        .lt("created_at", weekEnd),
      db
        .from("v1_event_exceptions")
        .select("event_id")
        .eq("organization_id", organizationId)
        .gte("created_at", weekStart)
        .lt("created_at", weekEnd),
    ]);

    const nextUnits = (unitData || []) as UnitRow[];
    const nextListings = (listingData || []) as ListingRow[];
    const nextEvents = (eventData || []) as EventRow[];

    setUnits(nextUnits);
    setListings(nextListings);
    setEvents(nextEvents);
    setHoursRows((hoursData || []) as HoursRow[]);
    setExceptionRows((exceptionData || []) as ExceptionRow[]);

    const rootUnit = nextUnits.find((unit) => unit.type === "ORG_ROOT");
    if (selectedUnitId === "ALL" && rootUnit) {
      setSelectedUnitId(rootUnit.id);
    }

    const eventIds = [...new Set(nextEvents.map((event) => event.id))];
    if (eventIds.length === 0) {
      setRuns([]);
      setQaRows([]);
      return;
    }

    const { data: runData } = await db
      .from("v1_checklist_runs")
      .select("id, event_id, started_at")
      .eq("organization_id", organizationId)
      .in("event_id", eventIds);

    const nextRuns = (runData || []) as RunRow[];
    setRuns(nextRuns);

    const runIds = [...new Set(nextRuns.map((run) => run.id))];
    if (runIds.length === 0) {
      setQaRows([]);
      return;
    }

    const { data: qaData } = await db
      .from("v1_qa_reviews")
      .select("run_id, status")
      .eq("organization_id", organizationId)
      .in("run_id", runIds);

    setQaRows((qaData || []) as QaRow[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const scope = useMemo(() => {
    if (selectedUnitId === "ALL") {
      return new Set(units.map((unit) => unit.id));
    }
    return collectDescendantUnitIds(units, selectedUnitId);
  }, [selectedUnitId, units]);

  const listingIdsInScope = useMemo(() => {
    const set = new Set<string>();
    for (const listing of listings) {
      if (scope.has(listing.unit_id)) {
        set.add(listing.id);
      }
    }
    return set;
  }, [listings, scope]);

  const eventsInScope = useMemo(() => {
    return events.filter((event) => listingIdsInScope.has(event.listing_id));
  }, [events, listingIdsInScope]);

  const eventIdsInScope = useMemo(() => new Set(eventsInScope.map((event) => event.id)), [eventsInScope]);

  const runByEventId = useMemo(() => {
    const map: Record<string, RunRow> = {};
    for (const run of runs) map[run.event_id] = run;
    return map;
  }, [runs]);

  const qaByRunId = useMemo(() => {
    const map: Record<string, QaRow> = {};
    for (const row of qaRows) map[row.run_id] = row;
    return map;
  }, [qaRows]);

  const metrics = useMemo(() => {
    const completed = eventsInScope.filter((event) => event.status === "COMPLETED");

    const onTimeGraceMinutes = 15;
    let onTimeNumerator = 0;
    let onTimeDenominator = 0;

    for (const event of eventsInScope) {
      const run = runByEventId[event.id];
      if (!run?.started_at) continue;

      onTimeDenominator += 1;
      const startedAt = new Date(run.started_at).getTime();
      const allowedStart = new Date(event.start_at).getTime() + onTimeGraceMinutes * 60 * 1000;
      if (startedAt <= allowedStart) onTimeNumerator += 1;
    }

    let qaRejectDenominator = 0;
    let qaRejectNumerator = 0;

    for (const run of runs) {
      if (!eventIdsInScope.has(run.event_id)) continue;
      const qa = qaByRunId[run.id];
      if (!qa) continue;
      if (qa.status === "PENDING") continue;
      qaRejectDenominator += 1;
      if (qa.status === "REJECTED") qaRejectNumerator += 1;
    }

    const totalMinutes = hoursRows
      .filter((row) => row.event_id && eventIdsInScope.has(row.event_id))
      .reduce((sum, row) => sum + Number(row.minutes || 0), 0);

    const exceptionsCount = exceptionRows.filter((row) => eventIdsInScope.has(row.event_id)).length;

    const eventCount = eventsInScope.length;

    return {
      turnoversCompleted: completed.length,
      onTimePercent: onTimeDenominator === 0 ? 0 : (onTimeNumerator / onTimeDenominator) * 100,
      qaRejectRate: qaRejectDenominator === 0 ? 0 : (qaRejectNumerator / qaRejectDenominator) * 100,
      avgMinutesPerTurnover: completed.length === 0 ? 0 : totalMinutes / completed.length,
      exceptionsPer100Events: eventCount === 0 ? 0 : (exceptionsCount / eventCount) * 100,
      eventCount,
    };
  }, [eventIdsInScope, eventsInScope, exceptionRows, hoursRows, qaByRunId, runByEventId, runs]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Reports (This Week)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Window: {new Date(weekStart).toLocaleString()} - {new Date(weekEnd).toLocaleString()}</p>
          <div className="max-w-xs space-y-1">
            <p className="text-xs text-muted-foreground">Unit scope</p>
            <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader><CardTitle className="text-sm">Turnovers Completed</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{metrics.turnoversCompleted}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">On-time %</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{metrics.onTimePercent.toFixed(1)}%</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">QA Reject Rate</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{metrics.qaRejectRate.toFixed(1)}%</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Avg Minutes / Turnover</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{metrics.avgMinutesPerTurnover.toFixed(1)}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Exceptions / 100 Events</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{metrics.exceptionsPer100Events.toFixed(1)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Events in selected scope this week: {metrics.eventCount}</p>
        </CardContent>
      </Card>
    </div>
  );
}
