import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";
import { supabase } from "@/integrations/supabase/client";

type RunRow = {
  id: string;
  event_id: string;
  cleaner_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
};

type QaRow = {
  run_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  notes: string | null;
  reviewer_id: string | null;
  created_at: string;
  decided_at: string | null;
};

type EventRow = {
  id: string;
  listing_id: string;
  start_at: string;
};

type ListingRow = {
  id: string;
  name: string;
};

type PhotoRow = {
  run_id: string;
  storage_path: string;
};

export default function QAReviewPage() {
  const { organizationId } = useAuth();

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [qaRows, setQaRows] = useState<QaRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [notesByRun, setNotesByRun] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  const load = async () => {
    if (!organizationId) return;

    const [{ data: runRows }, { data: qaReviewRows }] = await Promise.all([
      db
        .from("v1_checklist_runs")
        .select("id, event_id, cleaner_id, started_at, finished_at, status")
        .eq("organization_id", organizationId)
        .eq("status", "QA_REVIEW")
        .order("started_at", { ascending: false })
        .limit(100),
      db
        .from("v1_qa_reviews")
        .select("run_id, status, notes, reviewer_id, created_at, decided_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    const nextRuns = (runRows || []) as RunRow[];
    setRuns(nextRuns);
    setQaRows((qaReviewRows || []) as QaRow[]);

    const runIds = [...new Set(nextRuns.map((row) => row.id))];
    const eventIds = [...new Set(nextRuns.map((row) => row.event_id))];

    if (eventIds.length > 0) {
      const { data: eventRows } = await db
        .from("v1_events")
        .select("id, listing_id, start_at")
        .in("id", eventIds);

      const nextEvents = (eventRows || []) as EventRow[];
      setEvents(nextEvents);

      const listingIds = [...new Set(nextEvents.map((row) => row.listing_id))];
      if (listingIds.length > 0) {
        const { data: listingRows } = await db
          .from("v1_listings")
          .select("id, name")
          .in("id", listingIds);
        setListings((listingRows || []) as ListingRow[]);
      } else {
        setListings([]);
      }
    } else {
      setEvents([]);
      setListings([]);
    }

    if (runIds.length === 0) {
      setPhotos([]);
      setSignedUrls({});
      return;
    }

    const { data: photoRows } = await db
      .from("v1_checklist_photos")
      .select("run_id, storage_path")
      .in("run_id", runIds)
      .order("created_at", { ascending: false });

    const nextPhotos = (photoRows || []) as PhotoRow[];
    setPhotos(nextPhotos);

    const uniquePaths = [...new Set(nextPhotos.map((row) => row.storage_path))].slice(0, 300);
    if (uniquePaths.length === 0) {
      setSignedUrls({});
      return;
    }

    const { data: signed } = await supabase.storage
      .from("v1-checklist-photos")
      .createSignedUrls(uniquePaths, 60 * 60);

    const map: Record<string, string> = {};
    for (let idx = 0; idx < uniquePaths.length; idx += 1) {
      const path = uniquePaths[idx];
      const signedUrl = signed?.[idx]?.signedUrl;
      if (signedUrl) map[path] = signedUrl;
    }
    setSignedUrls(map);
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

  const qaByRunId = useMemo(() => {
    const map: Record<string, QaRow> = {};
    for (const row of qaRows) map[row.run_id] = row;
    return map;
  }, [qaRows]);

  const photosByRun = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of photos) {
      const list = map[row.run_id] || [];
      list.push(row.storage_path);
      map[row.run_id] = list;
    }
    return map;
  }, [photos]);

  const decide = async (runId: string, decision: "APPROVED" | "REJECTED") => {
    setStatusMessage(null);
    setBusyRunId(runId);

    const { data, error } = await supabase.functions.invoke("qa-decision-v1", {
      body: {
        run_id: runId,
        decision,
        notes: notesByRun[runId] || null,
      },
    });

    setBusyRunId(null);

    if (error || data?.error) {
      setStatusMessage(error?.message || data?.error || "QA decision failed.");
      return;
    }

    setStatusMessage(`QA ${decision.toLowerCase()} recorded.`);
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>QA Review Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs pending QA review.</p>}
          {runs.map((run) => {
            const event = eventById[run.event_id];
            const listing = event ? listingById[event.listing_id] : null;
            const qa = qaByRunId[run.id];
            const runPhotos = (photosByRun[run.id] || []).slice(0, 6);

            return (
              <div key={run.id} className="space-y-3 rounded border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{listing?.name || "Unknown listing"}</p>
                    <p className="text-xs text-muted-foreground">
                      Event {event?.start_at ? new Date(event.start_at).toLocaleString() : "Unknown time"} · Cleaner {run.cleaner_id}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Run status {run.status} · QA {qa?.status || "PENDING"}
                  </p>
                </div>

                {runPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {runPhotos.map((path) => {
                      const signedUrl = signedUrls[path];
                      return (
                        <div key={path} className="overflow-hidden rounded border border-border">
                          {signedUrl ? (
                            <img src={signedUrl} alt={path} className="h-24 w-full object-cover" />
                          ) : (
                            <div className="flex h-24 items-center justify-center text-[10px] text-muted-foreground">No preview</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Reviewer notes</p>
                  <Textarea
                    value={notesByRun[run.id] || ""}
                    onChange={(event) => setNotesByRun({ ...notesByRun, [run.id]: event.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => decide(run.id, "APPROVED")}
                    disabled={busyRunId === run.id}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => decide(run.id, "REJECTED")}
                    disabled={busyRunId === run.id}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
