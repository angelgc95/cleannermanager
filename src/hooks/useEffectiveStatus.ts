import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeEffectiveStatus, type EffectiveStatus } from "@/lib/domain/effectiveStatus";

export type { EffectiveStatus };

interface EventStatusInput {
  id: string;
  status: string;
}

export function useEffectiveStatuses(events: EventStatusInput[]) {
  const [statuses, setStatuses] = useState<Record<string, EffectiveStatus>>({});
  const [loading, setLoading] = useState(false);

  const eventIds = events.map((event) => event.id);

  useEffect(() => {
    if (eventIds.length === 0) {
      setStatuses({});
      return;
    }

    const fetch = async () => {
      setLoading(true);

      // List surfaces fetch latest run information for visible events only.
      const { data: runs } = await supabase
        .from("checklist_runs")
        .select("cleaning_event_id, finished_at, started_at")
        .in("cleaning_event_id", eventIds)
        .order("started_at", { ascending: false });

      const latestRunMap = new Map<string, string | null>();
      for (const r of (runs || [])) {
        if (!latestRunMap.has(r.cleaning_event_id)) {
          latestRunMap.set(r.cleaning_event_id, r.finished_at);
        }
      }

      const result: Record<string, EffectiveStatus> = {};
      for (const event of events) {
        result[event.id] = computeEffectiveStatus({
          eventStatus: event.status,
          latestRunFinishedAt: latestRunMap.get(event.id) ?? null,
          isCancelled: event.status === "CANCELLED",
        });
      }

      setStatuses(result);
      setLoading(false);
    };

    fetch();
  }, [events.map((event) => `${event.id}:${event.status}`).join(",")]);

  return { statuses, loading };
}
