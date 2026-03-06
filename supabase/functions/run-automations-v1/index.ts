import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
};

type TriggerType =
  | "EVENT_CREATED"
  | "EVENT_STARTING_SOON"
  | "EVENT_OVERDUE_START"
  | "CHECKLIST_SUBMITTED"
  | "CHECKLIST_FAILED"
  | "SUPPLIES_LOW"
  | "BOOKING_CANCELLED";

type NotificationType = "AUTOMATION" | "EXCEPTION" | "QA" | "SYSTEM";

type AutomationPayload = {
  organization_id?: string;
  trigger_type?: TriggerType;
  event_id?: string;
  run_id?: string;
  context?: Record<string, unknown>;
};

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  start_at: string;
  end_at: string;
  status: string;
  assigned_cleaner_id: string | null;
};

type RunRow = {
  id: string;
  organization_id: string;
  event_id: string;
  template_id: string;
};

type RuleRow = {
  id: string;
  organization_id: string;
  name: string;
  trigger_type: TriggerType;
  scope_unit_id: string | null;
  conditions: unknown;
  actions: unknown;
};

type ChecklistFacts = {
  hasFail: boolean;
  missingRequiredPhotos: boolean;
};

type EventFacts = {
  sameDayTurnover: boolean;
  startInMinutes: number;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseTrigger(value: unknown): TriggerType | null {
  if (typeof value !== "string") return null;
  const valid: TriggerType[] = [
    "EVENT_CREATED",
    "EVENT_STARTING_SOON",
    "EVENT_OVERDUE_START",
    "CHECKLIST_SUBMITTED",
    "CHECKLIST_FAILED",
    "SUPPLIES_LOW",
    "BOOKING_CANCELLED",
  ];
  return valid.includes(value as TriggerType) ? (value as TriggerType) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asActions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string").map((entry) => String(entry));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseNotificationType(value: unknown, fallback: NotificationType): NotificationType {
  const valid: NotificationType[] = ["AUTOMATION", "EXCEPTION", "QA", "SYSTEM"];
  if (typeof value === "string" && valid.includes(value as NotificationType)) {
    return value as NotificationType;
  }
  return fallback;
}

async function createNotifications(
  service: any,
  args: {
    organizationId: string;
    recipientUserIds: string[];
    type: NotificationType;
    title: string;
    body?: string | null;
    eventId?: string | null;
    exceptionId?: string | null;
    noOverwhelmExceptionWindowMinutes?: number;
  },
) {
  if (args.recipientUserIds.length === 0) return;

  let recipientUserIds = unique(args.recipientUserIds);

  if (
    args.exceptionId
    && typeof args.noOverwhelmExceptionWindowMinutes === "number"
    && args.noOverwhelmExceptionWindowMinutes > 0
  ) {
    const cutoff = new Date(Date.now() - args.noOverwhelmExceptionWindowMinutes * 60 * 1000).toISOString();
    const filteredRecipients: string[] = [];

    for (const recipientUserId of recipientUserIds) {
      const { count } = await service
        .from("v1_notifications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", args.organizationId)
        .eq("recipient_user_id", recipientUserId)
        .eq("exception_id", args.exceptionId)
        .is("read_at", null)
        .gte("created_at", cutoff);

      if ((count || 0) === 0) {
        filteredRecipients.push(recipientUserId);
      }
    }

    recipientUserIds = filteredRecipients;
  }

  if (recipientUserIds.length === 0) return;

  const rows = recipientUserIds.map((recipientUserId) => ({
    organization_id: args.organizationId,
    recipient_user_id: recipientUserId,
    event_id: args.eventId || null,
    exception_id: args.exceptionId || null,
    type: args.type,
    title: args.title,
    body: args.body || null,
  }));

  const { error } = await service
    .from("v1_notifications")
    .insert(rows);

  if (error) throw error;
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
      console.warn("run-automations-v1 webhook invoke failed", response.status, body);
    }
  } catch (error) {
    console.warn("run-automations-v1 webhook invoke error", error);
  }
}

async function resolveRecipients(
  service: any,
  organizationId: string,
  target: {
    user_id?: unknown;
    recipient_user_id?: unknown;
    role?: unknown;
    roles?: unknown;
  },
): Promise<string[]> {
  const directUserId = typeof target.user_id === "string"
    ? target.user_id
    : typeof target.recipient_user_id === "string"
      ? target.recipient_user_id
      : null;

  if (directUserId) {
    return [directUserId];
  }

  const singleRole = typeof target.role === "string" ? target.role : null;
  const roleList = singleRole ? [singleRole] : asStringArray(target.roles);
  const roles = unique(roleList);

  if (roles.length === 0) return [];

  let query = service
    .from("v1_organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (roles.length === 1) {
    query = query.eq("role", roles[0]);
  } else {
    query = query.in("role", roles);
  }

  const { data, error } = await query;
  if (error) throw error;

  return unique((data || []).map((row: { user_id: string }) => row.user_id));
}

async function ensureException(
  service: any,
  args: {
    organizationId: string;
    eventId: string;
    type: string;
    severity: string;
    notes?: string | null;
  },
) {
  const { data: existing } = await service
    .from("v1_event_exceptions")
    .select("id")
    .eq("organization_id", args.organizationId)
    .eq("event_id", args.eventId)
    .eq("type", args.type)
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await service
    .from("v1_event_exceptions")
    .insert({
      organization_id: args.organizationId,
      event_id: args.eventId,
      type: args.type,
      severity: args.severity,
      status: "OPEN",
      notes: args.notes || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id as string, created: true };
}

async function buildChecklistFacts(service: any, run: RunRow | null): Promise<ChecklistFacts> {
  if (!run) {
    return {
      hasFail: false,
      missingRequiredPhotos: false,
    };
  }

  const [{ count: failCount }, { data: requiredPhotoItems }, { data: photos }] = await Promise.all([
    service
      .from("v1_checklist_responses")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id)
      .eq("passed", false),
    service
      .from("v1_checklist_template_items")
      .select("id")
      .eq("template_id", run.template_id)
      .eq("photo_required", true),
    service
      .from("v1_checklist_photos")
      .select("item_id")
      .eq("run_id", run.id),
  ]);

  const requiredIds = new Set((requiredPhotoItems || []).map((row: { id: string }) => row.id));
  const photoIds = new Set((photos || []).map((row: { item_id: string | null }) => row.item_id).filter(Boolean));

  let missingRequiredPhotos = false;
  for (const requiredId of requiredIds) {
    if (!photoIds.has(requiredId)) {
      missingRequiredPhotos = true;
      break;
    }
  }

  return {
    hasFail: (failCount || 0) > 0,
    missingRequiredPhotos,
  };
}

async function buildEventFacts(service: any, event: EventRow | null): Promise<EventFacts> {
  if (!event) {
    return {
      sameDayTurnover: false,
      startInMinutes: Number.POSITIVE_INFINITY,
    };
  }

  const start = new Date(event.start_at);
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { count } = await service
    .from("v1_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", event.organization_id)
    .eq("listing_id", event.listing_id)
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString())
    .neq("id", event.id)
    .neq("status", "CANCELLED");

  return {
    sameDayTurnover: (count || 0) > 0,
    startInMinutes: (start.getTime() - Date.now()) / 60000,
  };
}

function passesConditions(
  conditions: unknown,
  eventFacts: EventFacts,
  checklistFacts: ChecklistFacts,
): boolean {
  const root = asObject(conditions);
  const eventConditions = asObject(root.event);
  const checklistConditions = asObject(root.checklist);

  const sameDayExpected = eventConditions.same_day_turnover ?? root["event.same_day_turnover"];
  if (typeof sameDayExpected === "boolean" && eventFacts.sameDayTurnover !== sameDayExpected) {
    return false;
  }

  const startInMinutesThreshold =
    eventConditions.start_in_minutes_lte
    ?? eventConditions["start_in_minutes<="]
    ?? root["event.start_in_minutes_lte"]
    ?? root["event.start_in_minutes<="];
  const threshold = toNumber(startInMinutesThreshold);
  if (threshold !== null && eventFacts.startInMinutes > threshold) {
    return false;
  }

  const checklistHasFail = checklistConditions.has_fail ?? root["checklist.has_fail"];
  if (typeof checklistHasFail === "boolean" && checklistFacts.hasFail !== checklistHasFail) {
    return false;
  }

  const checklistMissingPhotos =
    checklistConditions.missing_required_photos
    ?? root["checklist.missing_required_photos"];
  if (typeof checklistMissingPhotos === "boolean" && checklistFacts.missingRequiredPhotos !== checklistMissingPhotos) {
    return false;
  }

  return true;
}

async function handleExceptionNotifications(
  service: any,
  args: {
    action: Record<string, unknown>;
    organizationId: string;
    event: EventRow;
    exceptionId: string;
    exceptionType: string;
  },
) {
  const notifyRaw = args.action.notify;
  const notifyObject = asObject(notifyRaw);
  const notifyEnabled = notifyRaw === true
    || !!args.action.notify_role
    || !!args.action.notify_roles
    || !!args.action.notify_user_id
    || notifyObject.assignee === true
    || Object.keys(notifyObject).length > 0;

  if (!notifyEnabled) return;

  const recipients = new Set<string>();

  const directRecipients = await resolveRecipients(service, args.organizationId, {
    user_id: notifyObject.user_id ?? args.action.notify_user_id,
    role: notifyObject.role ?? args.action.notify_role,
    roles: notifyObject.roles ?? args.action.notify_roles,
  });
  for (const recipient of directRecipients) recipients.add(recipient);

  const notifyAssignee = notifyObject.assignee === true || args.action.notify_assignee === true;
  if (notifyAssignee && args.event.assigned_cleaner_id) {
    recipients.add(args.event.assigned_cleaner_id);
  }

  if (recipients.size === 0 && notifyRaw === true) {
    const managers = await resolveRecipients(service, args.organizationId, { roles: ["MANAGER", "QA"] });
    for (const manager of managers) recipients.add(manager);
  }

  if (recipients.size === 0) return;

  const title = typeof notifyObject.title === "string"
    ? notifyObject.title
    : `Exception created: ${args.exceptionType}`;
  const body = typeof notifyObject.body === "string"
    ? notifyObject.body
    : `Event ${args.event.id} raised exception ${args.exceptionType}.`;

  await createNotifications(service, {
    organizationId: args.organizationId,
    recipientUserIds: [...recipients],
    type: "EXCEPTION",
    title,
    body,
    eventId: args.event.id,
    exceptionId: args.exceptionId,
  });
}

async function executeAction(
  service: any,
  args: {
    action: Record<string, unknown>;
    organizationId: string;
    event: EventRow | null;
    runId: string | null;
    triggerType: TriggerType;
    actorUserId: string | null;
    supabaseUrl: string;
    serviceKey: string;
  },
) {
  const actionType = typeof args.action.type === "string" ? args.action.type : "";

  if (actionType === "create_exception") {
    if (!args.event) return;

    const exceptionType = (typeof args.action.exception_type === "string" ? args.action.exception_type : null)
      || (typeof args.action.type_value === "string" ? args.action.type_value : null)
      || (args.triggerType === "SUPPLIES_LOW" ? "SUPPLIES_LOW" : "CHECKLIST_FAILED");
    const severity = typeof args.action.severity === "string" ? args.action.severity : "MEDIUM";
    const notes = typeof args.action.notes === "string" ? args.action.notes : null;

    const exceptionResult = await ensureException(service, {
      organizationId: args.organizationId,
      eventId: args.event.id,
      type: exceptionType,
      severity,
      notes,
    });

    await handleExceptionNotifications(service, {
      action: args.action,
      organizationId: args.organizationId,
      event: args.event,
      exceptionId: exceptionResult.id,
      exceptionType,
    });

    if (exceptionResult.created) {
      await invokeWebhooks(args.supabaseUrl, args.serviceKey, {
        organization_id: args.organizationId,
        event_type: "EXCEPTION_CREATED",
        payload: {
          event_id: args.event.id,
          exception_id: exceptionResult.id,
          exception_type: exceptionType,
          trigger_type: args.triggerType,
          run_id: args.runId,
        },
      });
    }

    return;
  }

  if (actionType === "notify") {
    const recipients = new Set<string>();

    const directRecipients = await resolveRecipients(service, args.organizationId, {
      user_id: args.action.user_id,
      recipient_user_id: args.action.recipient_user_id,
      role: args.action.role,
      roles: args.action.roles,
    });
    for (const recipient of directRecipients) recipients.add(recipient);

    if (args.action.assignee === true && args.event?.assigned_cleaner_id) {
      recipients.add(args.event.assigned_cleaner_id);
    }

    if (recipients.size === 0) {
      console.log("run-automations-v1 notify skipped (no recipients)", {
        organization_id: args.organizationId,
        event_id: args.event?.id || null,
        run_id: args.runId,
        action: args.action,
      });
      return;
    }

    const notificationType = parseNotificationType(args.action.notification_type, "AUTOMATION");
    const exceptionId = typeof args.action.exception_id === "string" ? args.action.exception_id : null;
    const eventIdFromAction = typeof args.action.event_id === "string" ? args.action.event_id : null;

    const title = typeof args.action.title === "string"
      ? args.action.title
      : `Automation trigger: ${args.triggerType}`;
    const body = typeof args.action.body === "string"
      ? args.action.body
      : typeof args.action.message === "string"
        ? args.action.message
        : args.runId
          ? `Event ${args.event?.id || "n/a"}, run ${args.runId}`
          : `Event ${args.event?.id || "n/a"}`;

    await createNotifications(service, {
      organizationId: args.organizationId,
      recipientUserIds: [...recipients],
      type: notificationType,
      title,
      body,
      eventId: args.event?.id || eventIdFromAction,
      exceptionId,
      noOverwhelmExceptionWindowMinutes: exceptionId ? 30 : undefined,
    });

    return;
  }

  if (actionType === "set_event_priority") {
    if (!args.event) return;

    const severity = typeof args.action.severity === "string" ? args.action.severity : "MEDIUM";
    const priority = args.action.priority;

    const exceptionResult = await ensureException(service, {
      organizationId: args.organizationId,
      eventId: args.event.id,
      type: "LATE_START",
      severity,
      notes: `set_event_priority requested (${String(priority || "n/a")})`,
    });

    if (exceptionResult.created) {
      await invokeWebhooks(args.supabaseUrl, args.serviceKey, {
        organization_id: args.organizationId,
        event_type: "EXCEPTION_CREATED",
        payload: {
          event_id: args.event.id,
          exception_id: exceptionResult.id,
          exception_type: "LATE_START",
          trigger_type: args.triggerType,
          run_id: args.runId,
        },
      });
    }

    return;
  }
}

async function canUserTrigger(
  service: any,
  args: {
    organizationId: string;
    triggerType: TriggerType;
    userId: string;
    event: EventRow | null;
  },
): Promise<boolean> {
  const { data: membership } = await service
    .from("v1_organization_members")
    .select("role")
    .eq("organization_id", args.organizationId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (["OWNER", "ORG_ADMIN", "MANAGER", "QA"].includes(membership?.role || "")) {
    return true;
  }

  if (args.triggerType === "SUPPLIES_LOW" && args.event?.assigned_cleaner_id === args.userId) {
    return true;
  }

  if (
    ["CHECKLIST_SUBMITTED", "CHECKLIST_FAILED"].includes(args.triggerType)
    && args.event?.assigned_cleaner_id === args.userId
  ) {
    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const service = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as AutomationPayload;
    const triggerType = parseTrigger(body.trigger_type);
    if (!triggerType) {
      return json(400, { error: "trigger_type is required" });
    }

    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim() || "";
    const internalHeader = req.headers.get("x-internal-service-key") || "";
    const isInternalCall = bearer === serviceKey || internalHeader === serviceKey;

    let actorUserId: string | null = null;

    let runRow: RunRow | null = null;
    if (body.run_id) {
      const { data: runData, error: runError } = await service
        .from("v1_checklist_runs")
        .select("id, organization_id, event_id, template_id")
        .eq("id", body.run_id)
        .maybeSingle();

      if (runError) {
        return json(400, { error: runError.message });
      }

      runRow = (runData || null) as RunRow | null;
    }

    let eventRow: EventRow | null = null;
    const targetEventId = body.event_id || runRow?.event_id || null;
    if (targetEventId) {
      const { data: eventData, error: eventError } = await service
        .from("v1_events")
        .select("id, organization_id, listing_id, start_at, end_at, status, assigned_cleaner_id")
        .eq("id", targetEventId)
        .maybeSingle();

      if (eventError) {
        return json(400, { error: eventError.message });
      }

      eventRow = (eventData || null) as EventRow | null;
    }

    const organizationId = body.organization_id || eventRow?.organization_id || runRow?.organization_id || null;
    if (!organizationId) {
      return json(400, { error: "organization_id could not be resolved" });
    }

    if (!isInternalCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return json(401, { error: "Missing Authorization header" });
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        return json(401, { error: "Invalid token" });
      }

      actorUserId = userData.user.id;
      const allowed = await canUserTrigger(service, {
        organizationId,
        triggerType,
        userId: actorUserId,
        event: eventRow,
      });

      if (!allowed) {
        return json(403, { error: "Forbidden" });
      }
    }

    if (triggerType === "SUPPLIES_LOW" && eventRow) {
      const exceptionResult = await ensureException(service, {
        organizationId,
        eventId: eventRow.id,
        type: "SUPPLIES_LOW",
        severity: "MEDIUM",
        notes: "Supplies low reported from field app.",
      });

      if (exceptionResult.created) {
        await invokeWebhooks(supabaseUrl, serviceKey, {
          organization_id: organizationId,
          event_type: "EXCEPTION_CREATED",
          payload: {
            event_id: eventRow.id,
            exception_id: exceptionResult.id,
            exception_type: "SUPPLIES_LOW",
            trigger_type: triggerType,
            run_id: runRow?.id || null,
          },
        });
      }
    }

    const { data: rulesData, error: rulesError } = await service
      .from("v1_rules")
      .select("id, organization_id, name, trigger_type, scope_unit_id, conditions, actions")
      .eq("organization_id", organizationId)
      .eq("enabled", true)
      .eq("trigger_type", triggerType)
      .order("created_at", { ascending: true });

    if (rulesError) {
      return json(400, { error: rulesError.message });
    }

    const rules = (rulesData || []) as RuleRow[];
    if (rules.length === 0) {
      return json(200, {
        ok: true,
        organization_id: organizationId,
        trigger_type: triggerType,
        evaluated_rules: 0,
        executed_rules: 0,
      });
    }

    let listingUnitId: string | null = null;
    if (eventRow?.listing_id) {
      const { data: listing } = await service
        .from("v1_listings")
        .select("unit_id")
        .eq("id", eventRow.listing_id)
        .maybeSingle();
      listingUnitId = listing?.unit_id || null;
    }

    const [eventFacts, checklistFacts] = await Promise.all([
      buildEventFacts(service, eventRow),
      buildChecklistFacts(service, runRow),
    ]);

    let executedRules = 0;
    let failedRules = 0;

    for (const rule of rules) {
      let inScope = true;
      if (rule.scope_unit_id) {
        if (!listingUnitId) {
          inScope = false;
        } else {
          const { data: scoped, error: scopeError } = await service.rpc("v1_unit_in_scope", {
            _target_unit_id: listingUnitId,
            _scope_unit_id: rule.scope_unit_id,
          });

          if (scopeError) {
            inScope = false;
          } else {
            inScope = !!scoped;
          }
        }
      }

      if (!inScope) continue;
      if (!passesConditions(rule.conditions, eventFacts, checklistFacts)) continue;

      try {
        const actions = asActions(rule.actions);
        for (const action of actions) {
          await executeAction(service, {
            action,
            organizationId,
            event: eventRow,
            runId: runRow?.id || null,
            triggerType,
          actorUserId,
          supabaseUrl,
          serviceKey,
        });
        }

        await service.from("v1_rule_runs").insert({
          organization_id: organizationId,
          rule_id: rule.id,
          event_id: eventRow?.id || null,
          run_id: runRow?.id || null,
          status: "SUCCESS",
          error: null,
        });

        executedRules += 1;
      } catch (error) {
        failedRules += 1;
        const message = error instanceof Error ? error.message : String(error);

        await service.from("v1_rule_runs").insert({
          organization_id: organizationId,
          rule_id: rule.id,
          event_id: eventRow?.id || null,
          run_id: runRow?.id || null,
          status: "FAILED",
          error: message,
        });
      }
    }

    return json(200, {
      ok: true,
      organization_id: organizationId,
      trigger_type: triggerType,
      evaluated_rules: rules.length,
      executed_rules: executedRules,
      failed_rules: failedRules,
      checklist_facts: checklistFacts,
      event_facts: eventFacts,
    });
  } catch (error) {
    console.error("run-automations-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
