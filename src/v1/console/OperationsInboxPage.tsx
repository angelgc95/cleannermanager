import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type ExceptionStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH";

type ExceptionRow = {
  id: string;
  event_id: string;
  type: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  assigned_to_user_id: string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
};

type EventRow = {
  id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  start_at: string;
};

type ListingRow = {
  id: string;
  unit_id: string;
  name: string;
};

type UnitRow = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
};

type MemberRow = {
  user_id: string;
  role: string;
};

function exceptionAge(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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

  while (queue.length > 0) {
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

export default function OperationsInboxPage() {
  const { organizationId, user } = useAuth();

  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | ExceptionStatus>("OPEN");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | ExceptionSeverity>("ALL");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");

  const load = async () => {
    if (!organizationId) return;

    const [{ data: exceptionRows }, { data: unitRows }, { data: memberRows }] = await Promise.all([
      db
        .from("v1_event_exceptions")
        .select("id, event_id, type, severity, status, assigned_to_user_id, notes, created_at, resolved_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("v1_org_units")
        .select("id, name, type, parent_id")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
      db
        .from("v1_organization_members")
        .select("user_id, role")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    const nextExceptions = (exceptionRows || []) as ExceptionRow[];
    setExceptions(nextExceptions);
    setUnits((unitRows || []) as UnitRow[]);
    setMembers((memberRows || []) as MemberRow[]);

    const eventIds = [...new Set(nextExceptions.map((row) => row.event_id))];
    if (eventIds.length === 0) {
      setEvents([]);
      setListings([]);
      return;
    }

    const { data: eventRows } = await db
      .from("v1_events")
      .select("id, listing_id, assigned_cleaner_id, start_at")
      .in("id", eventIds);

    const nextEvents = (eventRows || []) as EventRow[];
    setEvents(nextEvents);

    const listingIds = [...new Set(nextEvents.map((row) => row.listing_id))];
    if (listingIds.length === 0) {
      setListings([]);
      return;
    }

    const { data: listingRows } = await db
      .from("v1_listings")
      .select("id, unit_id, name")
      .in("id", listingIds);

    setListings((listingRows || []) as ListingRow[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const eventById = useMemo(() => {
    const map: Record<string, EventRow> = {};
    for (const event of events) map[event.id] = event;
    return map;
  }, [events]);

  const listingById = useMemo(() => {
    const map: Record<string, ListingRow> = {};
    for (const listing of listings) map[listing.id] = listing;
    return map;
  }, [listings]);

  const unitById = useMemo(() => {
    const map: Record<string, UnitRow> = {};
    for (const unit of units) map[unit.id] = unit;
    return map;
  }, [units]);

  const memberIds = useMemo(() => {
    return [...new Set(members.map((member) => member.user_id))];
  }, [members]);

  const filtered = useMemo(() => {
    const activeUnitScope = unitFilter !== "ALL" ? collectDescendantUnitIds(units, unitFilter) : null;

    return exceptions.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (severityFilter !== "ALL" && row.severity !== severityFilter) return false;

      if (assigneeFilter === "UNASSIGNED" && row.assigned_to_user_id) return false;
      if (assigneeFilter !== "ALL" && assigneeFilter !== "UNASSIGNED" && row.assigned_to_user_id !== assigneeFilter) {
        return false;
      }

      if (activeUnitScope) {
        const event = eventById[row.event_id];
        const listing = event ? listingById[event.listing_id] : null;
        if (!listing) return false;
        if (!activeUnitScope.has(listing.unit_id)) return false;
      }

      return true;
    });
  }, [assigneeFilter, eventById, exceptions, listingById, severityFilter, statusFilter, unitFilter, units]);

  const updateException = async (id: string, patch: Record<string, unknown>) => {
    setMessage(null);
    const { error } = await db.from("v1_event_exceptions").update(patch).eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }

    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Operations Inbox</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="OPEN">OPEN</SelectItem>
                <SelectItem value="ACKNOWLEDGED">ACKNOWLEDGED</SelectItem>
                <SelectItem value="RESOLVED">RESOLVED</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Severity</p>
            <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as typeof severityFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="LOW">LOW</SelectItem>
                <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                <SelectItem value="HIGH">HIGH</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Unit Scope</p>
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All units</SelectItem>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Assignee</p>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                {memberIds.map((id) => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exceptions ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No exceptions for current filters.</p>}
          {filtered.map((row) => {
            const event = eventById[row.event_id];
            const listing = event ? listingById[event.listing_id] : null;
            const unit = listing ? unitById[listing.unit_id] : null;

            return (
              <div key={row.id} className="space-y-2 rounded border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{row.type}</p>
                  <p className="text-xs text-muted-foreground">{row.status} · {row.severity} · age {exceptionAge(row.created_at)}</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Listing: {listing?.name || "Unknown"} · Unit: {unit?.name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Event time: {event?.start_at ? new Date(event.start_at).toLocaleString() : "Unknown"} · Cleaner: {event?.assigned_cleaner_id || "Unassigned"}
                </p>
                <p className="text-xs text-muted-foreground">Assignee: {row.assigned_to_user_id || "Unassigned"}</p>
                {row.notes && <p className="text-xs text-muted-foreground">Notes: {row.notes}</p>}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateException(row.id, { assigned_to_user_id: user?.id || null })} disabled={!user?.id}>
                    Assign to me
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateException(row.id, { status: "ACKNOWLEDGED" })}>
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateException(row.id, { status: "RESOLVED", resolved_at: new Date().toISOString() })}
                  >
                    Resolve
                  </Button>
                  <Link to={`/console/events/${row.event_id}`}>
                    <Button size="sm">Open event</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
