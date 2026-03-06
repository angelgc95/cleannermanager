import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScopeType = "ORG" | "UNIT" | "LISTING";
type ManagerRole = "OWNER" | "ORG_ADMIN" | "MANAGER";
type BulkMode = "CLONE" | "SCOPE_EXISTING";
type BatchAction = "ASSIGNED" | "SKIPPED";

type BulkApplyRulesPayload = {
  organization_id?: string;
  source_rule_ids?: string[];
  target_unit_id?: string;
  mode?: BulkMode;
  dry_run?: boolean;
};

type UnitRow = {
  id: string;
  parent_id: string | null;
  name: string;
};

type RoleAssignmentRow = {
  role: ManagerRole;
  scope_type: ScopeType;
  scope_id: string | null;
};

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  scope_unit_id: string | null;
  conditions: unknown;
  actions: unknown;
};

type BatchItemRow = {
  batch_id: string;
  source_rule_id: string;
  result_rule_id: string | null;
  action: BatchAction;
  notes: string | null;
};

type RuleOutcome = {
  source_rule_id: string;
  source_rule_name: string;
  action: BatchAction;
  notes: string;
};

type Summary = {
  rules_total: number;
  rules_updated: number;
  rules_skipped: number;
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

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function isBulkMode(value: unknown): value is BulkMode {
  return value === "CLONE" || value === "SCOPE_EXISTING";
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

function ruleSignature(rule: RuleRow) {
  return JSON.stringify({
    name: rule.name,
    enabled: rule.enabled,
    trigger_type: rule.trigger_type,
    conditions: rule.conditions,
    actions: rule.actions,
    scope_unit_id: rule.scope_unit_id,
  });
}

async function insertBatchItems(service: any, rows: BatchItemRow[]) {
  for (const rowChunk of chunk(rows, 200)) {
    const { error } = await service
      .from("v1_rule_batch_items")
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

    const body = await req.json().catch(() => ({})) as BulkApplyRulesPayload;
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    const targetUnitId = typeof body.target_unit_id === "string" ? body.target_unit_id : null;
    const mode = isBulkMode(body.mode) ? body.mode : null;
    const sourceRuleIds = uniqueStrings(body.source_rule_ids);
    const dryRun = body.dry_run === true;

    if (!organizationId || !targetUnitId || !mode || sourceRuleIds.length === 0) {
      return json(400, { error: "organization_id, source_rule_ids, target_unit_id, and mode are required" });
    }

    const [{ data: unitRows, error: unitError }, { data: sourceRuleRows, error: sourceRuleError }, { data: existingRuleRows, error: existingRulesError }] = await Promise.all([
      service
        .from("v1_org_units")
        .select("id, parent_id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      service
        .from("v1_rules")
        .select("id, name, enabled, trigger_type, scope_unit_id, conditions, actions")
        .eq("organization_id", organizationId)
        .in("id", sourceRuleIds),
      service
        .from("v1_rules")
        .select("id, name, enabled, trigger_type, scope_unit_id, conditions, actions")
        .eq("organization_id", organizationId),
    ]);

    if (unitError) throw unitError;
    if (sourceRuleError) throw sourceRuleError;
    if (existingRulesError) throw existingRulesError;

    const units = (unitRows || []) as UnitRow[];
    const selectedUnit = units.find((unit) => unit.id === targetUnitId);
    if (!selectedUnit) {
      return json(404, { error: "Target unit not found in organization scope" });
    }

    const parentById = new Map(units.map((unit) => [unit.id, unit.parent_id]));
    const allowed = await canManageScope(service, userData.user.id, organizationId, targetUnitId, parentById);
    if (!allowed) {
      return json(403, { error: "Manager+ scope required for selected unit" });
    }

    const sourceRules = (sourceRuleRows || []) as RuleRow[];
    if (sourceRules.length !== sourceRuleIds.length) {
      return json(404, { error: "One or more source rules were not found in organization scope" });
    }

    const allRules = (existingRuleRows || []) as RuleRow[];
    const targetScopedSignatures = new Set(
      allRules
        .filter((rule) => rule.scope_unit_id === targetUnitId)
        .map((rule) => ruleSignature(rule)),
    );

    const outcomes: RuleOutcome[] = [];

    for (const rule of sourceRules) {
      if (mode === "SCOPE_EXISTING") {
        if (rule.scope_unit_id === targetUnitId) {
          outcomes.push({
            source_rule_id: rule.id,
            source_rule_name: rule.name,
            action: "SKIPPED",
            notes: "Rule already targets the selected unit.",
          });
        } else {
          outcomes.push({
            source_rule_id: rule.id,
            source_rule_name: rule.name,
            action: "ASSIGNED",
            notes: `Rule scope will move to ${selectedUnit.name}.`,
          });
        }
        continue;
      }

      const cloneCandidate: RuleRow = {
        ...rule,
        scope_unit_id: targetUnitId,
      };

      if (targetScopedSignatures.has(ruleSignature(cloneCandidate))) {
        outcomes.push({
          source_rule_id: rule.id,
          source_rule_name: rule.name,
          action: "SKIPPED",
          notes: "Equivalent rule already exists for the selected unit.",
        });
      } else {
        outcomes.push({
          source_rule_id: rule.id,
          source_rule_name: rule.name,
          action: "ASSIGNED",
          notes: `Rule will be cloned for ${selectedUnit.name}.`,
        });
        targetScopedSignatures.add(ruleSignature(cloneCandidate));
      }
    }

    const summary: Summary = {
      rules_total: sourceRules.length,
      rules_updated: outcomes.filter((outcome) => outcome.action === "ASSIGNED").length,
      rules_skipped: outcomes.filter((outcome) => outcome.action === "SKIPPED").length,
    };

    let batchId: string | null = null;

    if (!dryRun) {
      const { data: batchRow, error: batchError } = await service
        .from("v1_rule_batches")
        .insert({
          organization_id: organizationId,
          actor_user_id: userData.user.id,
          target_unit_id: targetUnitId,
          mode,
          rule_count: sourceRules.length,
        })
        .select("id")
        .single();

      if (batchError || !batchRow?.id) {
        throw batchError || new Error("Failed to create rule batch");
      }

      batchId = batchRow.id as string;
      const batchItems: BatchItemRow[] = [];

      for (const outcome of outcomes) {
        if (outcome.action === "SKIPPED") {
          batchItems.push({
            batch_id: batchId,
            source_rule_id: outcome.source_rule_id,
            result_rule_id: null,
            action: "SKIPPED",
            notes: outcome.notes,
          });
          continue;
        }

        const sourceRule = sourceRules.find((rule) => rule.id === outcome.source_rule_id);
        if (!sourceRule) continue;

        if (mode === "SCOPE_EXISTING") {
          const { error } = await service
            .from("v1_rules")
            .update({ scope_unit_id: targetUnitId })
            .eq("id", sourceRule.id);

          if (error) throw error;

          batchItems.push({
            batch_id: batchId,
            source_rule_id: sourceRule.id,
            result_rule_id: sourceRule.id,
            action: "ASSIGNED",
            notes: outcome.notes,
          });
          continue;
        }

        const { data: createdRule, error } = await service
          .from("v1_rules")
          .insert({
            organization_id: organizationId,
            name: sourceRule.name,
            enabled: sourceRule.enabled,
            trigger_type: sourceRule.trigger_type,
            scope_unit_id: targetUnitId,
            conditions: sourceRule.conditions,
            actions: sourceRule.actions,
          })
          .select("id")
          .single();

        if (error || !createdRule?.id) {
          throw error || new Error(`Failed to clone rule ${sourceRule.id}`);
        }

        batchItems.push({
          batch_id: batchId,
          source_rule_id: sourceRule.id,
          result_rule_id: createdRule.id as string,
          action: "ASSIGNED",
          notes: outcome.notes,
        });
      }

      await insertBatchItems(service, batchItems);
    }

    const previewItems = (outcomes.filter((outcome) => outcome.action !== "SKIPPED").length > 0
      ? outcomes.filter((outcome) => outcome.action !== "SKIPPED")
      : outcomes).slice(0, 50);

    return json(200, {
      ok: true,
      dry_run: dryRun,
      batch_id: batchId,
      organization_id: organizationId,
      target_unit_id: targetUnitId,
      mode,
      summary,
      preview: previewItems,
    });
  } catch (error) {
    console.error("bulk-apply-rules-v1 error", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});
