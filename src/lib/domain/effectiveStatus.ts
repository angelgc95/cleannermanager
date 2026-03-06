export type EffectiveStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ComputeEffectiveStatusInput {
  eventStatus: string | null | undefined;
  latestRunFinishedAt: string | null | undefined;
  isCancelled: boolean;
}

export function computeEffectiveStatus({
  eventStatus,
  latestRunFinishedAt,
  isCancelled,
}: ComputeEffectiveStatusInput): EffectiveStatus {
  if (isCancelled || eventStatus === "CANCELLED") return "CANCELLED";
  if (latestRunFinishedAt) return "COMPLETED";
  if (eventStatus === "DONE") return "COMPLETED";
  if (eventStatus === "IN_PROGRESS") return "IN_PROGRESS";
  return "TODO";
}

export function computeStoredStatus(eventStatus: string | null | undefined): EffectiveStatus {
  return computeEffectiveStatus({
    eventStatus,
    latestRunFinishedAt: null,
    isCancelled: eventStatus === "CANCELLED",
  });
}

// Backward-compatible wrappers used by existing code paths.
export interface LatestRunInfo {
  finished_at: string | null;
}

export function deriveEffectiveStatus(
  eventStatus: string,
  latestRun: LatestRunInfo | null | undefined,
): EffectiveStatus {
  return computeEffectiveStatus({
    eventStatus,
    latestRunFinishedAt: latestRun?.finished_at ?? null,
    isCancelled: eventStatus === "CANCELLED",
  });
}

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
