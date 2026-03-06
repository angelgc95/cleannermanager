import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";
import { supabase } from "@/integrations/supabase/client";

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
};

type CleanerRow = { user_id: string };

export default function ConsoleEventDetailPage() {
  const { eventId } = useParams();
  const { organizationId } = useAuth();

  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [cleaners, setCleaners] = useState<CleanerRow[]>([]);
  const [selectedCleaner, setSelectedCleaner] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = async () => {
    if (!eventId || !organizationId) return;

    const [{ data: eventData }, { data: cleanerData }] = await Promise.all([
      db.from("v1_events").select("id, organization_id, listing_id, assigned_cleaner_id, status, start_at, end_at").eq("id", eventId).eq("organization_id", organizationId).maybeSingle(),
      db.from("v1_organization_members").select("user_id").eq("organization_id", organizationId).eq("role", "CLEANER"),
    ]);

    setEventRow((eventData || null) as EventRow | null);
    setCleaners((cleanerData || []) as CleanerRow[]);
    setSelectedCleaner(eventData?.assigned_cleaner_id || null);
  };

  useEffect(() => {
    load();
  }, [eventId, organizationId]);

  const saveCleaner = async () => {
    if (!eventRow) return;
    await db.from("v1_events").update({ assigned_cleaner_id: selectedCleaner }).eq("id", eventRow.id);
    setStatusMessage("Cleaner assignment updated.");
    await load();
  };

  const resetChecklist = async () => {
    if (!eventRow) return;
    const { data, error } = await supabase.functions.invoke("reset-event-v1", {
      body: { event_id: eventRow.id },
    });

    if (error || data?.error) {
      setStatusMessage(error?.message || data?.error || "Reset failed.");
      return;
    }

    setStatusMessage("Checklist run reset. Event is back to TODO.");
    await load();
  };

  if (!eventRow) {
    return <p className="text-sm text-muted-foreground">Event not found.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Event Detail</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="font-medium">Event:</span> {eventRow.id}</p>
          <p><span className="font-medium">Listing:</span> {eventRow.listing_id}</p>
          <p><span className="font-medium">Status:</span> {eventRow.status}</p>
          <p><span className="font-medium">Start:</span> {new Date(eventRow.start_at).toLocaleString()}</p>
          <p><span className="font-medium">End:</span> {new Date(eventRow.end_at).toLocaleString()}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reassign Cleaner</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Cleaner</Label>
            <Select value={selectedCleaner || "__none"} onValueChange={(value) => setSelectedCleaner(value === "__none" ? null : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassigned</SelectItem>
                {cleaners.map((cleaner) => <SelectItem key={cleaner.user_id} value={cleaner.user_id}>{cleaner.user_id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveCleaner}>Save Assignment</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reset Checklist</CardTitle></CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={resetChecklist}>Reset Event Checklist</Button>
        </CardContent>
      </Card>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
