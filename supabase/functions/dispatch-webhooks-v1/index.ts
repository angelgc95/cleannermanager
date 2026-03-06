import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
};

type WebhookEvent =
  | "EXCEPTION_CREATED"
  | "EXCEPTION_ESCALATED"
  | "QA_REQUIRED"
  | "QA_REJECTED"
  | "QA_APPROVED"
  | "SLA_BREACH"
  | "EVENT_CANCELLED";

type DispatchPayload = {
  organization_id?: string;
  event_type?: WebhookEvent;
  payload?: Record<string, unknown>;
  webhook_id?: string;
  test_mode?: boolean;
  force?: boolean;
};

type WebhookRow = {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  enabled: boolean;
  signing_secret: string | null;
  events: WebhookEvent[];
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isWebhookEvent(value: unknown): value is WebhookEvent {
  return [
    "EXCEPTION_CREATED",
    "EXCEPTION_ESCALATED",
    "QA_REQUIRED",
    "QA_REJECTED",
    "QA_APPROVED",
    "SLA_BREACH",
    "EVENT_CANCELLED",
  ].includes(String(value));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function canManageWebhooks(service: any, organizationId: string, userId: string) {
  const { data: membership } = await service
    .from("v1_organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .in("role", ["OWNER", "ORG_ADMIN", "MANAGER"])
    .maybeSingle();

  return !!membership?.role;
}

async function postWebhook(webhook: WebhookRow, payloadText: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-SCM-Webhook-Id": webhook.id,
  };

  if (webhook.signing_secret) {
    headers["X-SCM-Signature"] = `sha256=${await hmacSha256Hex(webhook.signing_secret, payloadText)}`;
  }

  const backoffs = [0, 300, 900];
  let lastError: string | null = null;

  for (const delayMs of backoffs) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: payloadText,
      });

      if (response.ok) {
        return { ok: true as const };
      }

      lastError = `HTTP ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown webhook error";
    }
  }

  return { ok: false as const, error: lastError || "Webhook failed" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = (await req.json().catch(() => ({}))) as DispatchPayload;
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    const eventType = isWebhookEvent(body.event_type) ? body.event_type : null;
    const testMode = body.test_mode === true;
    const force = body.force === true;
    const webhookId = typeof body.webhook_id === "string" ? body.webhook_id : null;

    if (!organizationId || !eventType) {
      return json(400, { error: "organization_id and event_type are required" });
    }

    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim() || "";
    const internalHeader = req.headers.get("x-internal-service-key") || "";
    const internalCall = bearer === serviceKey || internalHeader === serviceKey;

    const service = createClient(supabaseUrl, serviceKey);

    if (!internalCall) {
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

      const allowed = await canManageWebhooks(service, organizationId, userData.user.id);
      if (!allowed || !testMode || !webhookId) {
        return json(403, { error: "Only manager/admin test sends are allowed from the UI" });
      }
    }

    let query = service
      .from("v1_webhooks")
      .select("id, organization_id, name, url, enabled, signing_secret, events")
      .eq("organization_id", organizationId)
      .eq("enabled", true);

    if (webhookId) {
      query = query.eq("id", webhookId);
    }

    const { data: webhookRows, error: webhookError } = await query;
    if (webhookError) {
      return json(400, { error: webhookError.message });
    }

    const webhooks = ((webhookRows || []) as WebhookRow[]).filter((webhook) => {
      if (force) return true;
      return Array.isArray(webhook.events) && webhook.events.includes(eventType);
    });

    const basePayload = {
      organization_id: organizationId,
      event_type: eventType,
      payload: body.payload || {},
      dispatched_at: new Date().toISOString(),
      test_mode: testMode,
    };

    const delivered: Array<{ webhook_id: string; name: string }> = [];
    const failed: Array<{ webhook_id: string; name: string; error: string }> = [];

    for (const webhook of webhooks) {
      const payloadText = JSON.stringify({
        ...basePayload,
        webhook_id: webhook.id,
        webhook_name: webhook.name,
      });
      const result = await postWebhook(webhook, payloadText);
      if (result.ok) {
        delivered.push({ webhook_id: webhook.id, name: webhook.name });
      } else {
        console.warn("dispatch-webhooks-v1 delivery failed", {
          organization_id: organizationId,
          webhook_id: webhook.id,
          event_type: eventType,
          error: result.error,
        });
        failed.push({ webhook_id: webhook.id, name: webhook.name, error: result.error });
      }
    }

    return json(200, {
      ok: true,
      organization_id: organizationId,
      event_type: eventType,
      delivered_count: delivered.length,
      failed_count: failed.length,
      delivered,
      failed,
    });
  } catch (error) {
    console.error("dispatch-webhooks-v1 error", error);
    return json(500, { error: "Internal error" });
  }
});
