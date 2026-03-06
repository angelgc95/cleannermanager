import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScopeType = "ORG" | "UNIT" | "LISTING";
type ManagerRole = "OWNER" | "ORG_ADMIN" | "MANAGER";
type BatchAction = "ASSIGNED" | "SKIPPED";

type BulkApplyPayload = {
  organization_id?: string;
  unit_id?: string;
  template_id?: string;
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

type TemplateRow = {
  id: string;
  name: string;
  listing_id: string;
  active: boolean;
  created_at: string;
};

type TemplateAssignmentRow = {
  unit_id: string;
  template_id: string;
  updated_at: string;
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
  units_total: number;
  units_updated: number;
  listings_total: number;
  listings_assigned: number;
  listings_skipped: number;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    queue.push(...(childrenByParent.get(unitId) || []));
  }

  return scopedUnitIds;
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

function groupListingOverrides(rows: TemplateRow[]) {
  const overrideByListingId = new Map<string, TemplateRow>();
  for (const row of rows) {
    const current = overrideByListingId.get(row.listing_id);
    if (!current || row.created_at > current.created_at) {
      overrideByListingId.set(row.listing_id, row);
    }
  }
  return overrideByListingId;
}

function resolveInheritedTemplateId(
  unitId: string,
  parentById: Map<string, string | null>,
  assignmentsByUnitId: Map<string, TemplateAssignmentRow>,
) {
  let current: string | null = unitId;
  let guard = 0;
  while (current && guard < 32) {
    const assignment = assignmentsByUnitId.get(current);
    if (assignment) {
      return assignment.template_id;
    }
    current = parentById.get(current) ?? null;
    guard += 1;
  }

  return null;
}

async function upsertAssignments(
  service: any,
  rows: Array<{ organization_id: string; unit_id: string; template_id: string; updated_at: string }>,
) {
  for (const rowChunk of chunk(rows, 200)) {
    const { error } = await service
      .from("v1_template_assignments")
      .upsert(rowChunk, { onConflict: "organization_id,unit_id" });

    if (error) throw error;
  }
}

async function insertBatchItems(service: any, rows: BatchItemRow[]) {
  for (const rowChunk of chunk(rows, 200)) {
    const { error } = await service
      .from("v1_template_batch_items")
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

    const body = await req.json().catch(() => ({})) as BulkApplyPayload;
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    const unitId = typeof body.unit_id === "string" ? body.unit_id : null;
    const templateId = typeof body.template_id === "string" ? body.template_id : null;
    const includeDescendants = body.include_descendants !== false;
    const dryRun = body.dry_run === true;

    if (!organizationId || !unitId || !templateId) {
      return json(400, { error: "organization_id, unit_id, and template_id are required" });
    }

    const [{ data: templateRow, error: templateError }, { data: units, error: unitsError }] = await Promise.all([
      service
        .from("v1_checklist_templates")
        .select("id, name, listing_id, active, created_at")
        .eq("organization_id", organizationId)
        .eq("id", templateId)
        .eq("active", true)
        .maybeSingle(),
      service
        .from("v1_org_units")
        .select("id, parent_id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
    ]);

    if (templateError) throw templateError;
    if (unitsError) throw unitsError;
    if (!templateRow?.id) {
      return json(404, { error: "Active template not found in organization scope" });
    }

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

    const [{ data: listingRows, error: listingsError }, { data: activeTemplates, error: templatesError }, { data: assignmentRows, error: assignmentsError }] = await Promise.all([
      service
        .from("v1_listings")
        .select("id, name, unit_id")
        .eq("organization_id", organizationId)
        .in("unit_id", scopedUnitIds)
        .order("name", { ascending: true }),
      service
        .from("v1_checklist_templates")
        .select("id, name, listing_id, active, created_at")
        .eq("organization_id", organizationId)
        .eq("active", true),
      service
        .from("v1_template_assignments")
        .select("unit_id, template_id, updated_at, created_at")
        .eq("organization_id", organizationId),
    ]);

    if (listingsError) throw listingsError;
    if (templatesError) throw templatesError;
    if (assignmentsError) throw assignmentsError;

    const listings = (listingRows || []) as ListingRow[];
    const templates = (activeTemplates || []) as TemplateRow[];
    const templateAssignments = (assignmentRows || []) as TemplateAssignmentRow[];

    const overrideByListingId = groupListingOverrides(
      templates.filter((template) => !!template.listing_id),
    );
    const assignmentsByUnitId = new Map(templateAssignments.map((row) => [row.unit_id, row]));

    const nextAssignmentsByUnitId = new Map(assignmentsByUnitId);
    for (const scopedUnitId of scopedUnitIds) {
      nextAssignmentsByUnitId.set(scopedUnitId, {
        unit_id: scopedUnitId,
        template_id: templateId,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }

    const outcomes: ListingOutcome[] = listings.map((listing) => {
      const override = overrideByListingId.get(listing.id);
      if (override) {
        return {
          listing_id: listing.id,
          listing_name: listing.name,
          action: "SKIPPED",
          notes: `Listing override remains ${override.name}.`,
        };
      }

      const currentTemplateId = resolveInheritedTemplateId(listing.unit_id, parentById, assignmentsByUnitId);
      const nextTemplateId = resolveInheritedTemplateId(listing.unit_id, parentById, nextAssignmentsByUnitId);

      if (currentTemplateId === nextTemplateId) {
        return {
          listing_id: listing.id,
          listing_name: listing.name,
          action: "SKIPPED",
          notes: "Effective template already matches the selected template.",
        };
      }

      return {
        listing_id: listing.id,
        listing_name: listing.name,
        action: "ASSIGNED",
        notes: `Effective template will switch to ${templateRow.name}.`,
      };
    });

    const unitsToUpdate = scopedUnitIds.filter((scopedUnitId) => {
      return assignmentsByUnitId.get(scopedUnitId)?.template_id !== templateId;
    });

    const summary: Summary = {
      units_total: scopedUnitIds.length,
      units_updated: unitsToUpdate.length,
      listings_total: listings.length,
      listings_assigned: outcomes.filter((outcome) => outcome.action === "ASSIGNED").length,
      listings_skipped: outcomes.filter((outcome) => outcome.action === "SKIPPED").length,
    };

    let batchId: string | null = null;

    if (!dryRun) {
      const { data: batchRow, error: batchError } = await service
        .from("v1_template_batches")
        .insert({
          organization_id: organizationId,
          actor_user_id: userData.user.id,
          unit_id: unitId,
          template_id: templateId,
          include_descendants: includeDescendants,
          listing_count: listings.length,
        })
        .select("id")
        .single();

      if (batchError || !batchRow?.id) {
        throw batchError || new Error("Failed to create template batch");
      }

      batchId = batchRow.id as string;

      const nowIso = new Date().toISOString();
      await upsertAssignments(
        service,
        unitsToUpdate.map((scopedUnitId) => ({
          organization_id: organizationId,
          unit_id: scopedUnitId,
          template_id: templateId,
          updated_at: nowIso,
        })),
      );

      await insertBatchItems(
        service,
        outcomes.map((outcome) => ({
          batch_id: batchId as string,
          listing_id: outcome.listing_id,
          action: outcome.action,
          notes: outcome.notes,
        })),
      );
    }

    const previewItems = (outcomes.filter((outcome) => outcome.action !== "SKIPPED").length > 0
      ? outcomes.filter((outcome) => outcome.action !== "SKIPPED")
      : outcomes).slice(0, 50);

    return json(200, {
      ok: true,
      dry_run: dryRun,
      batch_id: batchId,
      organization_id: organizationId,
      unit_id: unitId,
      template_id: templateId,
      include_descendants: includeDescendants,
      summary,
      affected_listings: previewItems,
    });
  } catch (error) {
    console.error("bulk-assign-templates-v1 error", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});
