import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type RunRow = {
  id: string;
  event_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
};

export default function ChecklistLandingPage() {
  const { user, organizationId } = useAuth();
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      let query = db
        .from("v1_checklist_runs")
        .select("id, event_id, status, started_at, finished_at")
        .eq("cleaner_id", user.id)
        .order("started_at", { ascending: false })
        .limit(50);

      if (organizationId) query = query.eq("organization_id", organizationId);

      const { data } = await query;
      setRuns((data || []) as RunRow[]);
    };

    load();
  }, [user?.id, organizationId]);

  return (
    <Card>
      <CardHeader><CardTitle>Checklist Runs</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {runs.length === 0 && <p className="text-sm text-muted-foreground">No checklist runs yet.</p>}
        {runs.map((run) => (
          <Link key={run.id} to={`/field/events/${run.event_id}/checklist`} className="block rounded border border-border px-3 py-2 hover:bg-muted/30">
            <div className="text-sm font-medium">Run {run.id.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground">{run.status} · {new Date(run.started_at).toLocaleString()}</div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
