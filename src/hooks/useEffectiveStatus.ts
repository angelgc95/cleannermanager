import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deriveEffectiveStatus, type EffectiveStatus } from "@/lib/domain/effectiveStatus";

export type { EffectiveStatus };

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

      // Fetch all runs + event statuses
      const [{ data: runs }, { data: events }] = await Promise.all([
        supabase
          .from("checklist_runs")
          .select("cleaning_event_id, finished_at, started_at")
          .in("cleaning_event_id", eventIds)
          .order("started_at", { ascending: false }),
        supabase
          .from("cleaning_events")
          .select("id, status")
          .in("id", eventIds),
      ]);

      const latestRunMap = new Map<string, { finished_at: string | null }>();
      for (const r of (runs || [])) {
        if (!latestRunMap.has(r.cleaning_event_id)) {
          latestRunMap.set(r.cleaning_event_id, r);
        }
      }

      const eventStatusMap = new Map<string, string>();
      for (const ev of (events || [])) {
        eventStatusMap.set(ev.id, ev.status);
      }

      const result: Record<string, EffectiveStatus> = {};
      for (const eid of eventIds) {
        result[eid] = deriveEffectiveStatus(
          eventStatusMap.get(eid) || "TODO",
          latestRunMap.get(eid) ?? null,
        );
      }

      setStatuses(result);
      setLoading(false);
    };

    fetch();
  }, [eventIds.join(",")]);

  return { statuses, loading };
}
