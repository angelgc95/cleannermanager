import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SubmitItem = {
  item_id: string;
  passed: boolean | null;
  comment?: string | null;
  photos?: string[];
};

type SubmitPayload = {
  event_id?: string;
  responses?: SubmitItem[];
};

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  status: string;
};

type RunRow = {
  id: string;
  organization_id: string;
  event_id: string;
  template_id: string;
  cleaner_id: string;
};

type TemplateItem = {
  id: string;
  label: string;
  required: boolean;
  photo_required: boolean;
  fail_requires_comment: boolean;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhotos(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return [...unique];
}

function normalizeResponses(input: unknown): SubmitItem[] {
  if (!Array.isArray(input)) return [];

  const normalized: SubmitItem[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const itemId = typeof (entry as Record<string, unknown>).item_id === "string"
      ? ((entry as Record<string, unknown>).item_id as string)
      : "";
    if (!itemId) continue;

    const passedRaw = (entry as Record<string, unknown>).passed;
    const passed = passedRaw === true ? true : passedRaw === false ? false : null;

    const commentRaw = (entry as Record<string, unknown>).comment;
    const comment = typeof commentRaw === "string" ? commentRaw.trim() : "";

    normalized.push({
      item_id: itemId,
      passed,
      comment,
      photos: normalizePhotos((entry as Record<string, unknown>).photos),
    });
  }

  return normalized;
}

async function invokeAutomations(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/run-automations-v1`, {
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
      console.warn("checklist-submit-v1 automation invoke failed", response.status, body);
    }
  } catch (error) {
    console.warn("checklist-submit-v1 automation invoke error", error);
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
      console.warn("checklist-submit-v1 webhook invoke failed", response.status, body);
    }
  } catch (error) {
    console.warn("checklist-submit-v1 webhook invoke error", error);
  }
}

async function ensureQaReviewException(service: any, organizationId: string, eventId: string) {
  const { data: existing } = await service
    .from("v1_event_exceptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .eq("type", "QA_REVIEW_REQUIRED")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existing?.id) return { id: existing.id as string, created: false };

  const { data, error } = await service
    .from("v1_event_exceptions")
    .insert({
      organization_id: organizationId,
      event_id: eventId,
      type: "QA_REVIEW_REQUIRED",
      severity: "MEDIUM",
      status: "OPEN",
      notes: "Checklist submitted with failed items; QA review required.",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw error || new Error("Failed to create QA review exception");
  }

  return { id: data.id as string, created: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const userId = userData.user.id;
    const body = (await req.json().catch(() => ({}))) as SubmitPayload;
    const eventId = body.event_id;

    if (!eventId) {
      return json(400, { error: "event_id is required" });
    }

    const submittedResponses = normalizeResponses(body.responses);

    const { data: eventData, error: eventError } = await service
      .from("v1_events")
      .select("id, organization_id, listing_id, assigned_cleaner_id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !eventData) {
      return json(404, { error: "Event not found" });
    }

    const eventRow = eventData as EventRow;

    const { data: membership } = await service
      .from("v1_organization_members")
      .select("role")
      .eq("organization_id", eventRow.organization_id)
      .eq("user_id", userId)
      .maybeSingle();

    const managerLike = ["OWNER", "ORG_ADMIN", "MANAGER", "QA"].includes(membership?.role || "");
    const assignedCleaner = eventRow.assigned_cleaner_id === userId;

    if (!assignedCleaner && !managerLike) {
      return json(403, { error: "Only assigned cleaner or manager/qa can submit" });
    }

    if (eventRow.status === "CANCELLED") {
      return json(400, { error: "Cannot submit checklist for cancelled event" });
    }

    let runRow: RunRow | null = null;
    {
      const { data: existingRun } = await service
        .from("v1_checklist_runs")
        .select("id, organization_id, event_id, template_id, cleaner_id")
        .eq("event_id", eventId)
        .maybeSingle();

      runRow = (existingRun || null) as RunRow | null;
    }

    if (!runRow) {
      const { data: templateId, error: templateResolveError } = await userClient
        .rpc("v1_resolve_listing_template", { _listing_id: eventRow.listing_id });

      if (templateResolveError) {
        return json(400, { error: templateResolveError.message });
      }

      if (!templateId) {
        return json(400, { error: "No active checklist template for this listing" });
      }

      const { data: createdRun, error: createRunError } = await service
        .from("v1_checklist_runs")
        .insert({
          organization_id: eventRow.organization_id,
          event_id: eventRow.id,
          template_id: templateId,
          cleaner_id: eventRow.assigned_cleaner_id || userId,
          status: "IN_PROGRESS",
        })
        .select("id, organization_id, event_id, template_id, cleaner_id")
        .single();

      if (createRunError || !createdRun) {
        return json(400, { error: createRunError?.message || "Failed to create checklist run" });
      }

      runRow = createdRun as RunRow;
    }

    const { data: itemRows, error: itemError } = await service
      .from("v1_checklist_template_items")
      .select("id, label, required, photo_required, fail_requires_comment")
      .eq("template_id", runRow.template_id)
      .order("sort_order", { ascending: true });

    if (itemError) {
      return json(400, { error: itemError.message });
    }

    const templateItems = (itemRows || []) as TemplateItem[];
    if (templateItems.length === 0) {
      return json(400, { error: "Checklist template has no items" });
    }

    const responseMap = new Map<string, SubmitItem>();
    for (const entry of submittedResponses) {
      responseMap.set(entry.item_id, entry);
    }

    const validationErrors: string[] = [];
    const responseUpserts: Array<Record<string, unknown>> = [];
    const photoRows: Array<Record<string, unknown>> = [];

    let hasFail = false;

    for (const item of templateItems) {
      const response = responseMap.get(item.id) || {
        item_id: item.id,
        passed: null,
        comment: "",
        photos: [],
      };

      const comment = typeof response.comment === "string" ? response.comment.trim() : "";
      const photos = normalizePhotos(response.photos);

      if (item.required && response.passed === null) {
        validationErrors.push(`${item.label}: required response missing`);
      }
      if (item.photo_required && photos.length === 0) {
        validationErrors.push(`${item.label}: required photo missing`);
      }
      if (response.passed === false && item.fail_requires_comment && !comment) {
        validationErrors.push(`${item.label}: fail comment required`);
      }

      if (response.passed === false) {
        hasFail = true;
      }

      responseUpserts.push({
        organization_id: eventRow.organization_id,
        run_id: runRow.id,
        item_id: item.id,
        passed: response.passed,
        comment: comment || null,
      });

      for (const path of photos) {
        photoRows.push({
          organization_id: eventRow.organization_id,
          run_id: runRow.id,
          item_id: item.id,
          storage_path: path,
        });
      }
    }

    if (validationErrors.length > 0) {
      return json(400, {
        error: "Checklist validation failed",
        details: validationErrors,
      });
    }

    const { error: responsesError } = await service
      .from("v1_checklist_responses")
      .upsert(responseUpserts, { onConflict: "run_id,item_id" });

    if (responsesError) {
      return json(400, { error: responsesError.message });
    }

    const { error: clearPhotosError } = await service
      .from("v1_checklist_photos")
      .delete()
      .eq("run_id", runRow.id);

    if (clearPhotosError) {
      return json(400, { error: clearPhotosError.message });
    }

    if (photoRows.length > 0) {
      const { error: photosError } = await service
        .from("v1_checklist_photos")
        .insert(photoRows);

      if (photosError) {
        return json(400, { error: photosError.message });
      }
    }

    const now = new Date().toISOString();
    const nextRunStatus = hasFail ? "QA_REVIEW" : "COMPLETED";

    const { error: runUpdateError } = await service
      .from("v1_checklist_runs")
      .update({
        status: nextRunStatus,
        finished_at: now,
      })
      .eq("id", runRow.id);

    if (runUpdateError) {
      return json(400, { error: runUpdateError.message });
    }

    const { error: eventUpdateError } = await service
      .from("v1_events")
      .update({
        status: nextRunStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      })
      .eq("id", eventRow.id);

    if (eventUpdateError) {
      return json(400, { error: eventUpdateError.message });
    }

    if (hasFail) {
      const { error: qaError } = await service
        .from("v1_qa_reviews")
        .upsert(
          {
            organization_id: eventRow.organization_id,
            run_id: runRow.id,
            status: "PENDING",
            reviewer_id: null,
            notes: null,
            decided_at: null,
          },
          { onConflict: "run_id" },
        );

      if (qaError) {
        return json(400, { error: qaError.message });
      }

      const qaException = await ensureQaReviewException(service, eventRow.organization_id, eventRow.id);
      await invokeWebhooks(supabaseUrl, serviceKey, {
        organization_id: eventRow.organization_id,
        event_type: "QA_REQUIRED",
        payload: {
          event_id: eventRow.id,
          run_id: runRow.id,
          exception_id: qaException.id,
        },
      });
      if (qaException.created) {
        await invokeWebhooks(supabaseUrl, serviceKey, {
          organization_id: eventRow.organization_id,
          event_type: "EXCEPTION_CREATED",
          payload: {
            event_id: eventRow.id,
            run_id: runRow.id,
            exception_id: qaException.id,
            exception_type: "QA_REVIEW_REQUIRED",
          },
        });
      }
    }

    await invokeAutomations(supabaseUrl, serviceKey, {
      organization_id: eventRow.organization_id,
      trigger_type: "CHECKLIST_SUBMITTED",
      event_id: eventRow.id,
      run_id: runRow.id,
    });

    if (hasFail) {
      await invokeAutomations(supabaseUrl, serviceKey, {
        organization_id: eventRow.organization_id,
        trigger_type: "CHECKLIST_FAILED",
        event_id: eventRow.id,
        run_id: runRow.id,
      });
    }

    return json(200, {
      ok: true,
      event_id: eventRow.id,
      run_id: runRow.id,
      run_status: nextRunStatus,
      event_status: nextRunStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      qa_review_required: hasFail,
    });
  } catch (error) {
    console.error("checklist-submit-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
