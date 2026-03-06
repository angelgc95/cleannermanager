import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bug } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { deriveEffectiveStatus } from "@/lib/domain/effectiveStatus";

interface DebugPanelProps {
  eventId: string;
}

export function EventDebugPanel({ eventId }: DebugPanelProps) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);

  if (role !== "host") return null;

  const load = async () => {
    const [{ data: ev }, { data: runs }] = await Promise.all([
      supabase
        .from("cleaning_events")
        .select("id, host_user_id, assigned_cleaner_id, checklist_run_id, status, listing_id")
        .eq("id", eventId)
        .single(),
      supabase
        .from("checklist_runs")
        .select("id, finished_at, started_at")
        .eq("cleaning_event_id", eventId)
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    const latestRun = runs && runs.length > 0 ? runs[0] : null;
    const effectiveStatus = ev ? deriveEffectiveStatus(ev.status, latestRun) : "UNKNOWN";
    setData({ event: ev, latestRun, effectiveStatus });
    setOpen(true);
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-muted-foreground">
        <Bug className="h-3.5 w-3.5" /> Debug
      </Button>
    );
  }

  return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
            <Bug className="h-3.5 w-3.5" /> Event Debug
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-6 text-xs">
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data ? (
          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-muted/30 rounded p-2">
{JSON.stringify({
  event_id: data.event?.id,
  host_user_id: data.event?.host_user_id,
  assigned_cleaner_id: data.event?.assigned_cleaner_id,
  checklist_run_id: data.event?.checklist_run_id,
  db_status: data.event?.status,
  effective_status: data.effectiveStatus,
  latest_run_id: data.latestRun?.id || null,
  latest_run_finished_at: data.latestRun?.finished_at || null,
}, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}
      </CardContent>
    </Card>
  );
}
