import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type EventRow = {
  id: string;
  listing_id: string;
  organization_id: string;
  start_at: string;
  end_at: string;
  status: string;
};

type ListingRow = { id: string; name: string };

export default function TodayPage() {
  const { user, organizationId } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [listingMap, setListingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      let query = db
        .from("v1_events")
        .select("id, listing_id, organization_id, start_at, end_at, status")
        .eq("assigned_cleaner_id", user.id)
        .order("start_at", { ascending: true })
        .limit(100);

      if (organizationId) query = query.eq("organization_id", organizationId);

      const { data: eventRows } = await query;
      const rows = (eventRows || []) as EventRow[];
      setEvents(rows);

      const listingIds = [...new Set(rows.map((row) => row.listing_id))];
      if (listingIds.length === 0) {
        setListingMap({});
        return;
      }

      const { data: listingRows } = await db.from("v1_listings").select("id, name").in("id", listingIds);
      const map: Record<string, string> = {};
      for (const listing of (listingRows || []) as ListingRow[]) {
        map[listing.id] = listing.name;
      }
      setListingMap(map);
    };

    load();
  }, [user?.id, organizationId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-muted-foreground">Assigned events ready for checklist execution.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Assigned Events</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 && <p className="text-sm text-muted-foreground">No assigned events.</p>}
          {events.map((event) => (
            <Link key={event.id} to={`/field/events/${event.id}`} className="block rounded border border-border px-3 py-2 hover:bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{listingMap[event.listing_id] || event.listing_id}</p>
                  <p className="text-xs text-muted-foreground">{new Date(event.start_at).toLocaleString()}</p>
                </div>
                <span className="text-xs text-muted-foreground">{event.status}</span>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
