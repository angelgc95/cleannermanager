import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  start_at: string;
  status: string;
};

export default function FieldCalendarPage() {
  const { user, organizationId } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      let query = db
        .from("v1_events")
        .select("id, organization_id, listing_id, start_at, status")
        .eq("assigned_cleaner_id", user.id)
        .order("start_at", { ascending: true })
        .limit(200);

      if (organizationId) query = query.eq("organization_id", organizationId);

      const { data } = await query;
      setEvents((data || []) as EventRow[]);
    };

    load();
  }, [user?.id, organizationId]);

  return (
    <Card>
      <CardHeader><CardTitle>Calendar</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming assigned events.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded border border-border px-3 py-2 text-sm">
              <div className="font-medium">{new Date(event.start_at).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{event.status} · Listing {event.listing_id}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
