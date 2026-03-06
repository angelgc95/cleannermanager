/**
 * Derives the effective status for a cleaning event based on
 * its latest checklist run state. This is the SINGLE SOURCE OF TRUTH
 * for event status across the entire application.
 *
 * Rules:
 *   - If event.status === "CANCELLED" → "CANCELLED"
 *   - If a run exists with finished_at not null → "COMPLETED"
 *   - If a run exists with finished_at null → "IN_PROGRESS"
 *   - Otherwise → "TODO"
 */
export type EffectiveStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface LatestRunInfo {
  finished_at: string | null;
}

/**
 * Derive effective status from the DB event status and latest run.
 * Use this everywhere instead of raw event.status.
 */
export function deriveEffectiveStatus(
  eventStatus: string,
  latestRun: LatestRunInfo | null | undefined,
): EffectiveStatus {
  if (eventStatus === "CANCELLED") return "CANCELLED";
  if (!latestRun) return "TODO";
  return latestRun.finished_at ? "COMPLETED" : "IN_PROGRESS";
}

/**
 * Batch version: given a map of eventId → latestRun, derive statuses.
 */
export function deriveEffectiveStatuses(
  events: { id: string; status: string }[],
  latestRuns: Map<string, LatestRunInfo>,
): Record<string, EffectiveStatus> {
  const result: Record<string, EffectiveStatus> = {};
  for (const ev of events) {
    result[ev.id] = deriveEffectiveStatus(ev.status, latestRuns.get(ev.id) ?? null);
  }
  return result;
}
