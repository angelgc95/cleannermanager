import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AssignmentMode = "ADD" | "REPLACE" | "REMOVE";
type BatchAction = "ASSIGNED" | "UNASSIGNED" | "SKIPPED";
type ScopeType = "ORG" | "UNIT" | "LISTING";
type ManagerRole = "OWNER" | "ORG_ADMIN" | "MANAGER";

type BulkAssignPayload = {
  organization_id?: string;
  unit_id?: string;
  mode?: AssignmentMode;
  cleaner_ids?: string[];
  include_descendants?: boolean;
  dry_run?: boolean;
};

type UnitRow = {
  id: string;
  parent_id: string | null;
  name: string;
};

type ListingRow = {
  id: string;
  name: string;
  unit_id: string;
};

type AssignmentRow = {
  id: string;
  listing_id: string;
  cleaner_id: string;
  active: boolean;
  created_at: string;
};

type RoleAssignmentRow = {
  role: ManagerRole;
  scope_type: ScopeType;
  scope_id: string | null;
};

type BatchItemRow = {
  batch_id: string;
  listing_id: string;
  action: BatchAction;
  notes: string | null;
};

type ListingOutcome = {
  listing_id: string;
  listing_name: string;
  action: BatchAction;
  notes: string;
};

type Summary = {
  listings_total: number;
  listings_assigned: number;
  listings_unassigned: number;
  listings_skipped: number;
  assignment_rows_inserted: number;
  assignment_rows_reactivated: number;
  assignment_rows_deactivated: number;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function isAssignmentMode(value: unknown): value is AssignmentMode {
  return value === "ADD" || value === "REPLACE" || value === "REMOVE";
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function unitScopeCovers(targetUnitId: string, scopeUnitId: string | null, parentById: Map<string, string | null>) {
  if (!scopeUnitId) return false;

  let current: string | null = targetUnitId;
  let guard = 0;
  while (current && guard < 32) {
    if (current === scopeUnitId) return true;
    current = parentById.get(current) ?? null;
    guard += 1;
  }

  return false;
}

function collectScopedUnitIds(rootUnitId: string, includeDescendants: boolean, units: UnitRow[]) {
  if (!includeDescendants) return [rootUnitId];

  const childrenByParent = new Map<string, string[]>();
  for (const unit of units) {
    const parentId = unit.parent_id || "__root__";
    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(unit.id);
    childrenByParent.set(parentId, siblings);
  }

  const scopedUnitIds: string[] = [];
  const queue = [rootUnitId];
  while (queue.length > 0) {
    const unitId = queue.shift();
    if (!unitId || scopedUnitIds.includes(unitId)) continue;
    scopedUnitIds.push(unitId);
    const children = childrenByParent.get(unitId) || [];
    queue.push(...children);
  }

  return scopedUnitIds;
}

function groupAssignmentsByListing(rows: AssignmentRow[]) {
  const map = new Map<string, AssignmentRow[]>();
  for (const row of rows) {
    const current = map.get(row.listing_id) || [];
    current.push(row);
    map.set(row.listing_id, current);
  }

  for (const entries of map.values()) {
    entries.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  return map;
}

function buildListingNote(parts: string[], fallback: string) {
  const compact = parts.filter(Boolean);
  return compact.length > 0 ? compact.join(" ") : fallback;
}

async function fetchAssignmentsForListings(service: any, organizationId: string, listingIds: string[]) {
  const assignments: AssignmentRow[] = [];
  for (const listingChunk of chunk(listingIds, 200)) {
    const { data, error } = await service
      .from("v1_listing_assignments")
      .select("id, listing_id, cleaner_id, active, created_at")
      .eq("organization_id", organizationId)
      .in("listing_id", listingChunk);

    if (error) throw error;
    assignments.push(...((data || []) as AssignmentRow[]));
  }
  return assignments;
}

async function validateCleanerIds(service: any, organizationId: string, cleanerIds: string[]) {
  if (cleanerIds.length === 0) return;

  const { data, error } = await service
    .from("v1_organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "CLEANER")
    .in("user_id", cleanerIds);

  if (error) throw error;

  const validCleanerIds = new Set((data || []).map((row: { user_id: string }) => row.user_id));
  const invalidCleanerIds = cleanerIds.filter((cleanerId) => !validCleanerIds.has(cleanerId));
  if (invalidCleanerIds.length > 0) {
    throw new Error(`Invalid cleaner_ids: ${invalidCleanerIds.join(", ")}`);
  }
}

async function canManageScope(
  service: any,
  userId: string,
  organizationId: string,
  unitId: string,
  parentById: Map<string, string | null>,
) {
  const managerRoles: ManagerRole[] = ["OWNER", "ORG_ADMIN", "MANAGER"];

  const { data: memberRows, error: memberError } = await service
    .from("v1_organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (memberError) throw memberError;

  if ((memberRows || []).some((row: { role: string }) => managerRoles.includes(row.role as ManagerRole))) {
    return true;
  }

  const { data: assignmentRows, error: assignmentError } = await service
    .from("v1_role_assignments")
    .select("role, scope_type, scope_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .in("role", managerRoles)
    .in("scope_type", ["ORG", "UNIT"]);

  if (assignmentError) throw assignmentError;

  return (assignmentRows || []).some((assignment: RoleAssignmentRow) =>
    assignment.scope_type === "ORG"
      || (assignment.scope_type === "UNIT" && unitScopeCovers(unitId, assignment.scope_id, parentById))
  );
}

async function updateAssignmentsByIds(service: any, assignmentIds: string[], active: boolean) {
  for (const idChunk of chunk(assignmentIds, 200)) {
    const { error } = await service
      .from("v1_listing_assignments")
      .update({ active })
      .in("id", idChunk);

    if (error) throw error;
  }
}

async function insertAssignments(service: any, rows: Array<{ organization_id: string; listing_id: string; cleaner_id: string; active: boolean }>) {
  for (const rowChunk of chunk(rows, 200)) {
    const { error } = await service
      .from("v1_listing_assignments")
      .insert(rowChunk);

    if (error) throw error;
  }
}

async function insertBatchItems(service: any, rows: BatchItemRow[]) {
  for (const rowChunk of chunk(rows, 200)) {
    const { error } = await service
      .from("v1_assignment_batch_items")
      .insert(rowChunk);

    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { error: "Missing Authorization header" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json(401, { error: "Invalid token" });
    }

    const body = await req.json().catch(() => ({})) as BulkAssignPayload;
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    const unitId = typeof body.unit_id === "string" ? body.unit_id : null;
    const mode = isAssignmentMode(body.mode) ? body.mode : null;
    const cleanerIds = uniqueStrings(body.cleaner_ids);
    const includeDescendants = body.include_descendants !== false;
    const dryRun = body.dry_run === true;

    if (!organizationId || !unitId || !mode) {
      return json(400, { error: "organization_id, unit_id, and mode are required" });
    }

    if (mode === "ADD" && cleanerIds.length === 0) {
      return json(400, { error: "cleaner_ids is required for ADD mode" });
    }

    await validateCleanerIds(service, organizationId, cleanerIds);

    const { data: units, error: unitsError } = await service
      .from("v1_org_units")
      .select("id, parent_id, name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (unitsError) throw unitsError;

    const unitRows = (units || []) as UnitRow[];
    const selectedUnit = unitRows.find((unit) => unit.id === unitId);
    if (!selectedUnit) {
      return json(404, { error: "Unit not found in organization scope" });
    }

    const parentById = new Map(unitRows.map((unit) => [unit.id, unit.parent_id]));
    const allowed = await canManageScope(service, userData.user.id, organizationId, unitId, parentById);
    if (!allowed) {
      return json(403, { error: "Manager+ scope required for selected unit" });
    }

    const scopedUnitIds = collectScopedUnitIds(unitId, includeDescendants, unitRows);
    const { data: listingsData, error: listingsError } = await service
      .from("v1_listings")
      .select("id, name, unit_id")
      .eq("organization_id", organizationId)
      .in("unit_id", scopedUnitIds)
      .order("name", { ascending: true });

    if (listingsError) throw listingsError;

    const listings = (listingsData || []) as ListingRow[];
    const listingIds = listings.map((listing) => listing.id);
    const assignments = listingIds.length > 0
      ? await fetchAssignmentsForListings(service, organizationId, listingIds)
      : [];
    const assignmentsByListing = groupAssignmentsByListing(assignments);

    const deactivateAssignmentIds = new Set<string>();
    const reactivateAssignmentIds = new Set<string>();
    const insertRows: Array<{ organization_id: string; listing_id: string; cleaner_id: string; active: boolean }> = [];
    const outcomes: ListingOutcome[] = [];

    for (const listing of listings) {
      const currentAssignments = assignmentsByListing.get(listing.id) || [];
      const activeByCleaner = new Map<string, AssignmentRow>();
      const inactiveByCleaner = new Map<string, AssignmentRow>();

      for (const assignment of currentAssignments) {
        if (assignment.active) {
          if (!activeByCleaner.has(assignment.cleaner_id)) {
            activeByCleaner.set(assignment.cleaner_id, assignment);
          }
          continue;
        }

        if (!inactiveByCleaner.has(assignment.cleaner_id)) {
          inactiveByCleaner.set(assignment.cleaner_id, assignment);
        }
      }

      const activeCleanerIds = [...activeByCleaner.keys()];

      if (mode === "ADD") {
        const cleanersToAdd = cleanerIds.filter((candidate) => !activeByCleaner.has(candidate));

        for (const cleanerId of cleanersToAdd) {
          const existingInactive = inactiveByCleaner.get(cleanerId);
          if (existingInactive) {
            reactivateAssignmentIds.add(existingInactive.id);
          } else {
            insertRows.push({
              organization_id: organizationId,
              listing_id: listing.id,
              cleaner_id: cleanerId,
              active: true,
            });
          }
        }

        outcomes.push({
          listing_id: listing.id,
          listing_name: listing.name,
          action: cleanersToAdd.length > 0 ? "ASSIGNED" : "SKIPPED",
          notes: cleanersToAdd.length > 0
            ? `Assigned ${cleanersToAdd.length} cleaner(s).`
            : "All selected cleaners were already active.",
        });
        continue;
      }

      if (mode === "REMOVE") {
        const cleanersToRemove = cleanerIds.length > 0
          ? cleanerIds.filter((candidate) => activeByCleaner.has(candidate))
          : activeCleanerIds;

        for (const cleanerId of cleanersToRemove) {
          const activeAssignment = activeByCleaner.get(cleanerId);
          if (activeAssignment) {
            deactivateAssignmentIds.add(activeAssignment.id);
          }
        }

        outcomes.push({
          listing_id: listing.id,
          listing_name: listing.name,
          action: cleanersToRemove.length > 0 ? "UNASSIGNED" : "SKIPPED",
          notes: cleanersToRemove.length > 0
            ? `Unassigned ${cleanersToRemove.length} cleaner(s).`
            : "No active assignments matched the removal request.",
        });
        continue;
      }

      const targetCleanerIds = new Set(cleanerIds);
      const cleanersToDeactivate = activeCleanerIds.filter((existingCleanerId) => !targetCleanerIds.has(existingCleanerId));
      const cleanersToAdd = cleanerIds.filter((candidate) => !activeByCleaner.has(candidate));

      for (const cleanerId of cleanersToDeactivate) {
        const activeAssignment = activeByCleaner.get(cleanerId);
        if (activeAssignment) {
          deactivateAssignmentIds.add(activeAssignment.id);
        }
      }

      for (const cleanerId of cleanersToAdd) {
        const existingInactive = inactiveByCleaner.get(cleanerId);
        if (existingInactive) {
          reactivateAssignmentIds.add(existingInactive.id);
        } else {
          insertRows.push({
            organization_id: organizationId,
            listing_id: listing.id,
            cleaner_id: cleanerId,
            active: true,
          });
        }
      }

      const parts = [
        cleanersToDeactivate.length > 0 ? `Unassigned ${cleanersToDeactivate.length} cleaner(s).` : "",
        cleanersToAdd.length > 0 ? `Assigned ${cleanersToAdd.length} cleaner(s).` : "",
      ];
      const listingAction: BatchAction =
        cleanersToDeactivate.length === 0 && cleanersToAdd.length === 0
          ? "SKIPPED"
          : cleanerIds.length === 0
            ? "UNASSIGNED"
            : "ASSIGNED";

      outcomes.push({
        listing_id: listing.id,
        listing_name: listing.name,
        action: listingAction,
        notes: buildListingNote(parts, "Assignments already matched the requested cleaner set."),
      });
    }

    const summary: Summary = {
      listings_total: listings.length,
      listings_assigned: outcomes.filter((outcome) => outcome.action === "ASSIGNED").length,
      listings_unassigned: outcomes.filter((outcome) => outcome.action === "UNASSIGNED").length,
      listings_skipped: outcomes.filter((outcome) => outcome.action === "SKIPPED").length,
      assignment_rows_inserted: insertRows.length,
      assignment_rows_reactivated: reactivateAssignmentIds.size,
      assignment_rows_deactivated: deactivateAssignmentIds.size,
    };

    let batchId: string | null = null;

    if (!dryRun) {
      const { data: batchRow, error: batchError } = await service
        .from("v1_assignment_batches")
        .insert({
          organization_id: organizationId,
          actor_user_id: userData.user.id,
          unit_id: unitId,
          mode,
          cleaner_ids: cleanerIds,
          listing_count: listings.length,
        })
        .select("id")
        .single();

      if (batchError || !batchRow?.id) {
        throw batchError || new Error("Failed to create assignment batch");
      }

      batchId = batchRow.id as string;

      await updateAssignmentsByIds(service, [...deactivateAssignmentIds], false);
      await updateAssignmentsByIds(service, [...reactivateAssignmentIds], true);
      await insertAssignments(service, insertRows);

      const batchItems: BatchItemRow[] = outcomes.map((outcome) => ({
        batch_id: batchId as string,
        listing_id: outcome.listing_id,
        action: outcome.action,
        notes: outcome.notes,
      }));
      await insertBatchItems(service, batchItems);
    }

    const affectedListings = outcomes.filter((outcome) => outcome.action !== "SKIPPED");
    const previewItems = (affectedListings.length > 0 ? affectedListings : outcomes).slice(0, 50);

    return json(200, {
      ok: true,
      dry_run: dryRun,
      batch_id: batchId,
      organization_id: organizationId,
      unit_id: unitId,
      include_descendants: includeDescendants,
      mode,
      cleaner_ids: cleanerIds,
      summary,
      affected_listings: previewItems,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid cleaner_ids")) {
      return json(400, { error: error.message });
    }

    console.error("bulk-assign-cleaners-v1 error", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});
