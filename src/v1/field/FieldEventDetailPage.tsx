import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type EventRow = {
  id: string;
  listing_id: string;
  start_at: string;
  end_at: string;
  status: string;
};

type RunRow = { id: string; status: string; started_at: string; finished_at: string | null };

export default function FieldEventDetailPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [runRow, setRunRow] = useState<RunRow | null>(null);

  useEffect(() => {
    if (!eventId || !user?.id) return;

    const load = async () => {
      const [{ data: eventData }, { data: runData }] = await Promise.all([
        db
          .from("v1_events")
          .select("id, listing_id, start_at, end_at, status")
          .eq("id", eventId)
          .eq("assigned_cleaner_id", user.id)
          .maybeSingle(),
        db
          .from("v1_checklist_runs")
          .select("id, status, started_at, finished_at")
          .eq("event_id", eventId)
          .maybeSingle(),
      ]);

      setEventRow((eventData || null) as EventRow | null);
      setRunRow((runData || null) as RunRow | null);
    };

    load();
  }, [eventId, user?.id]);

  if (!eventRow) {
    return <p className="text-sm text-muted-foreground">Event not found or not assigned to you.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Event Detail</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><span className="font-medium">Event:</span> {eventRow.id}</p>
          <p><span className="font-medium">Listing:</span> {eventRow.listing_id}</p>
          <p><span className="font-medium">Status:</span> {eventRow.status}</p>
          <p><span className="font-medium">Window:</span> {new Date(eventRow.start_at).toLocaleString()} → {new Date(eventRow.end_at).toLocaleString()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Checklist</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {runRow ? (
            <>
              <p>Run status: <span className="font-medium">{runRow.status}</span></p>
              <Link to={`/field/events/${eventRow.id}/checklist`}>
                <Button className="w-full">Continue Checklist</Button>
              </Link>
            </>
          ) : (
            <Link to={`/field/events/${eventRow.id}/checklist`}>
              <Button className="w-full">Start Checklist</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
