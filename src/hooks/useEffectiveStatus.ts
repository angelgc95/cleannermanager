import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EffectiveStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";

export function useEffectiveStatuses(eventIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, EffectiveStatus>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (eventIds.length === 0) {
      setStatuses({});
      return;
    }

    const fetch = async () => {
      setLoading(true);
      // Fetch all runs for all events, ordered by started_at DESC
      const { data: runs } = await supabase
        .from("checklist_runs")
        .select("cleaning_event_id, finished_at, started_at")
        .in("cleaning_event_id", eventIds)
        .order("started_at", { ascending: false });

      const result: Record<string, EffectiveStatus> = {};

      // Build map in single pass (runs are sorted by started_at DESC, so first occurrence per event is latest)
      const latestRunMap = new Map<string, { finished_at: string | null }>();
      for (const r of (runs || [])) {
        if (!latestRunMap.has(r.cleaning_event_id)) {
          latestRunMap.set(r.cleaning_event_id, r);
        }
      }

      for (const eid of eventIds) {
        const latestRun = latestRunMap.get(eid);
        if (!latestRun) {
          result[eid] = "TODO";
        } else if (latestRun.finished_at) {
          result[eid] = "COMPLETED";
        } else {
          result[eid] = "IN_PROGRESS";
        }
      }

      setStatuses(result);
      setLoading(false);
    };

    fetch();
  }, [eventIds.join(",")]);

  return { statuses, loading };
}
