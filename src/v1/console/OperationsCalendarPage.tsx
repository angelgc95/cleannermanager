import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type EventRow = {
  id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
};

type ListingRow = { id: string; name: string };

export default function OperationsCalendarPage() {
  const { organizationId } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [listingMap, setListingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      const [{ data: eventRows }, { data: listingRows }] = await Promise.all([
        db.from("v1_events").select("id, listing_id, assigned_cleaner_id, start_at, end_at, status").eq("organization_id", organizationId).order("start_at", { ascending: true }).limit(200),
        db.from("v1_listings").select("id, name").eq("organization_id", organizationId),
      ]);

      setEvents((eventRows || []) as EventRow[]);
      const map: Record<string, string> = {};
      for (const listing of (listingRows || []) as ListingRow[]) {
        map[listing.id] = listing.name;
      }
      setListingMap(map);
    };

    load();
  }, [organizationId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operations Calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events found.</p>}
        {events.map((event) => (
          <Link key={event.id} to={`/console/events/${event.id}`} className="block rounded border border-border px-3 py-2 hover:bg-muted/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{listingMap[event.listing_id] || event.listing_id}</p>
                <p className="text-xs text-muted-foreground">{new Date(event.start_at).toLocaleString()} → {new Date(event.end_at).toLocaleString()}</p>
              </div>
              <div className="text-xs text-muted-foreground">{event.status}</div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
