import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type QaDecisionPayload = {
  run_id?: string;
  decision?: "APPROVED" | "REJECTED";
  notes?: string;
};

type RunRow = {
  id: string;
  organization_id: string;
  event_id: string;
};

type EventRow = {
  id: string;
  listing_id: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function invokeAutomations(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/run-automations-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-internal-service-key": serviceKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("qa-decision-v1 automation invoke error", error);
  }
}

async function invokeWebhooks(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-webhooks-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-internal-service-key": serviceKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("qa-decision-v1 webhook invoke failed", response.status, body);
    }
  } catch (error) {
    console.warn("qa-decision-v1 webhook invoke error", error);
  }
}

async function ensureChecklistFailedException(
  service: any,
  organizationId: string,
  eventId: string,
  notes: string | null,
) {
  const { data: existing } = await service
    .from("v1_event_exceptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .eq("type", "CHECKLIST_FAILED")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existing?.id) {
    await service
      .from("v1_event_exceptions")
      .update({ notes: notes || null })
      .eq("id", existing.id);
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await service
    .from("v1_event_exceptions")
    .insert({
      organization_id: organizationId,
      event_id: eventId,
      type: "CHECKLIST_FAILED",
      severity: "HIGH",
      status: "OPEN",
      notes: notes || "QA rejected checklist submission.",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw error || new Error("Failed to create checklist failed exception");
  }

  return { id: data.id as string, created: true };
}

async function canDecideQa(
  service: any,
  args: { organizationId: string; listingId: string; unitId: string | null; userId: string },
): Promise<boolean> {
  const { data: membership } = await service
    .from("v1_organization_members")
    .select("role")
    .eq("organization_id", args.organizationId)
    .eq("user_id", args.userId)
    .in("role", ["MANAGER", "QA"])
    .maybeSingle();

  if (membership?.role) return true;

  const { data: scopedRows } = await service
    .from("v1_role_assignments")
    .select("scope_type, scope_id")
    .eq("organization_id", args.organizationId)
    .eq("user_id", args.userId)
    .in("role", ["MANAGER", "QA"]);

  const assignments = scopedRows || [];
  for (const assignment of assignments) {
    if (assignment.scope_type === "ORG") return true;
    if (assignment.scope_type === "LISTING" && assignment.scope_id === args.listingId) return true;
    if (assignment.scope_type === "UNIT" && assignment.scope_id && args.unitId) {
      const { data: inScope } = await service.rpc("v1_unit_in_scope", {
        _target_unit_id: args.unitId,
        _scope_unit_id: assignment.scope_id,
      });
      if (inScope) return true;
    }
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json(401, { error: "Invalid token" });

    const body = (await req.json().catch(() => ({}))) as QaDecisionPayload;
    const runId = body.run_id;
    const decision = body.decision;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!runId) return json(400, { error: "run_id is required" });
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return json(400, { error: "decision must be APPROVED or REJECTED" });
    }

    const { data: runData, error: runError } = await service
      .from("v1_checklist_runs")
      .select("id, organization_id, event_id")
      .eq("id", runId)
      .maybeSingle();

    if (runError || !runData) return json(404, { error: "Checklist run not found" });
    const runRow = runData as RunRow;

    const { data: eventData, error: eventError } = await service
      .from("v1_events")
      .select("id, listing_id")
      .eq("id", runRow.event_id)
      .maybeSingle();

    if (eventError || !eventData) return json(404, { error: "Event not found" });
    const eventRow = eventData as EventRow;

    const { data: listingData } = await service
      .from("v1_listings")
      .select("unit_id")
      .eq("id", eventRow.listing_id)
      .maybeSingle();

    const listingUnitId = listingData?.unit_id || null;

    const allowed = await canDecideQa(service, {
      organizationId: runRow.organization_id,
      listingId: eventRow.listing_id,
      unitId: listingUnitId,
      userId: userData.user.id,
    });

    if (!allowed) {
      return json(403, { error: "Manager/QA scope required" });
    }

    const now = new Date().toISOString();

    const { error: qaReviewError } = await service
      .from("v1_qa_reviews")
      .upsert(
        {
          organization_id: runRow.organization_id,
          run_id: runRow.id,
          status: decision,
          reviewer_id: userData.user.id,
          notes: notes || null,
          decided_at: now,
        },
        { onConflict: "run_id" },
      );

    if (qaReviewError) return json(400, { error: qaReviewError.message });

    if (decision === "APPROVED") {
      const [{ error: runUpdateError }, { error: eventUpdateError }, { error: resolveExceptionsError }] = await Promise.all([
        service
          .from("v1_checklist_runs")
          .update({ status: "COMPLETED", finished_at: now })
          .eq("id", runRow.id),
        service
          .from("v1_events")
          .update({ status: "COMPLETED" })
          .eq("id", runRow.event_id),
        service
          .from("v1_event_exceptions")
          .update({ status: "RESOLVED", resolved_at: now })
          .eq("organization_id", runRow.organization_id)
          .eq("event_id", runRow.event_id)
          .in("type", ["QA_REVIEW_REQUIRED", "CHECKLIST_FAILED"])
          .in("status", ["OPEN", "ACKNOWLEDGED"]),
      ]);

      if (runUpdateError || eventUpdateError || resolveExceptionsError) {
        return json(400, {
          error: runUpdateError?.message || eventUpdateError?.message || resolveExceptionsError?.message || "Update failed",
        });
      }

      await invokeWebhooks(supabaseUrl, serviceKey, {
        organization_id: runRow.organization_id,
        event_type: "QA_APPROVED",
        payload: {
          event_id: runRow.event_id,
          run_id: runRow.id,
          reviewer_id: userData.user.id,
        },
      });

      return json(200, {
        ok: true,
        run_id: runRow.id,
        decision,
      });
    }

    const [{ error: runUpdateError }, { error: eventUpdateError }] = await Promise.all([
      service
        .from("v1_checklist_runs")
        .update({ status: "QA_REVIEW", finished_at: null })
        .eq("id", runRow.id),
      service
        .from("v1_events")
        .update({ status: "IN_PROGRESS" })
        .eq("id", runRow.event_id),
    ]);

    if (runUpdateError || eventUpdateError) {
      return json(400, {
        error: runUpdateError?.message || eventUpdateError?.message || "Update failed",
      });
    }

    const checklistFailedException = await ensureChecklistFailedException(service, runRow.organization_id, runRow.event_id, notes || null);

    await invokeAutomations(supabaseUrl, serviceKey, {
      organization_id: runRow.organization_id,
      trigger_type: "CHECKLIST_FAILED",
      event_id: runRow.event_id,
      run_id: runRow.id,
    });

    await invokeWebhooks(supabaseUrl, serviceKey, {
      organization_id: runRow.organization_id,
      event_type: "QA_REJECTED",
      payload: {
        event_id: runRow.event_id,
        run_id: runRow.id,
        reviewer_id: userData.user.id,
        exception_id: checklistFailedException.id,
      },
    });

    if (checklistFailedException.created) {
      await invokeWebhooks(supabaseUrl, serviceKey, {
        organization_id: runRow.organization_id,
        event_type: "EXCEPTION_CREATED",
        payload: {
          event_id: runRow.event_id,
          run_id: runRow.id,
          exception_id: checklistFailedException.id,
          exception_type: "CHECKLIST_FAILED",
        },
      });
    }

    return json(200, {
      ok: true,
      run_id: runRow.id,
      decision,
    });
  } catch (error) {
    console.error("qa-decision-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
