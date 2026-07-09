import { resolveCleanerAssignment, type CleanerAssignmentRule } from "./assignmentRules.ts";

interface SupabaseLike {
  from(table: string): any;
}

interface ReassignOpenCleaningEventsArgs {
  supabase: SupabaseLike;
  hostUserId: string;
  listingId: string;
}

interface CleaningEventRow {
  id: string;
  start_at: string | null;
  assigned_cleaner_id: string | null;
}

export interface ReassignOpenCleaningEventsResult {
  scanned: number;
  updated: number;
}

export async function reassignOpenCleaningEventsForListing({
  supabase,
  hostUserId,
  listingId,
}: ReassignOpenCleaningEventsArgs): Promise<ReassignOpenCleaningEventsResult> {
  const { data: assignments, error: assignmentError } = await supabase
    .from("cleaner_assignments")
    .select("cleaner_user_id, listing_id, assignment_weekdays, created_at")
    .eq("host_user_id", hostUserId)
    .eq("listing_id", listingId);

  if (assignmentError) throw assignmentError;

  const { data: events, error: eventError } = await supabase
    .from("cleaning_events")
    .select("id, start_at, assigned_cleaner_id")
    .eq("host_user_id", hostUserId)
    .eq("listing_id", listingId)
    .eq("source", "AUTO")
    .eq("status", "TODO")
    .eq("locked", false)
    .is("checklist_run_id", null);

  if (eventError) throw eventError;

  const assignmentRules = (assignments || []) as CleanerAssignmentRule[];
  const safeEvents = (events || []) as CleaningEventRow[];
  let updated = 0;

  for (const event of safeEvents) {
    const resolvedAssignment = resolveCleanerAssignment(assignmentRules, event.start_at);
    const nextCleanerId = resolvedAssignment?.cleaner_user_id || null;
    if (nextCleanerId === event.assigned_cleaner_id) continue;

    const { error: updateError } = await supabase
      .from("cleaning_events")
      .update({ assigned_cleaner_id: nextCleanerId })
      .eq("id", event.id);

    if (updateError) throw updateError;
    updated++;
  }

  return {
    scanned: safeEvents.length,
    updated,
  };
}
