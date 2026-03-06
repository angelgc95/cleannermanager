import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function canManageEvent(service: any, userId: string, eventRow: { organization_id: string; listing_id: string }) {
  const { data: member } = await service
    .from("v1_organization_members")
    .select("role")
    .eq("organization_id", eventRow.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (["OWNER", "ORG_ADMIN", "MANAGER"].includes(member?.role || "")) {
    return true;
  }

  const { data: scoped } = await service
    .from("v1_role_assignments")
    .select("id")
    .eq("organization_id", eventRow.organization_id)
    .eq("user_id", userId)
    .in("role", ["OWNER", "ORG_ADMIN", "MANAGER"])
    .or(`scope_type.eq.ORG,scope_type.eq.LISTING,scope_type.eq.UNIT`);

  if (!scoped || scoped.length === 0) return false;

  const listing = await service
    .from("v1_listings")
    .select("unit_id")
    .eq("id", eventRow.listing_id)
    .maybeSingle();

  const unitId = listing?.data?.unit_id;

  return scoped.some((assignment: any) =>
    assignment.scope_type === "ORG"
      || (assignment.scope_type === "LISTING" && assignment.scope_id === eventRow.listing_id)
      || (assignment.scope_type === "UNIT" && unitId && assignment.scope_id === unitId)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventId = body?.event_id as string | undefined;
    if (!eventId) {
      return new Response(JSON.stringify({ error: "event_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: eventRow, error: eventError } = await service
      .from("v1_events")
      .select("id, organization_id, listing_id")
      .eq("id", eventId)
      .single();

    if (eventError || !eventRow) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed = await canManageEvent(service, userData.user.id, eventRow);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Manager+ access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: run } = await service
      .from("v1_checklist_runs")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (run?.id) {
      const { data: photos } = await service
        .from("v1_checklist_photos")
        .select("storage_path")
        .eq("run_id", run.id);

      const storagePaths = (photos || []).map((row: any) => row.storage_path).filter(Boolean);
      if (storagePaths.length > 0) {
        await service.storage.from("v1-checklist-photos").remove(storagePaths);
      }

      await service.from("v1_checklist_photos").delete().eq("run_id", run.id);
      await service.from("v1_checklist_responses").delete().eq("run_id", run.id);
      await service.from("v1_hours_entries").delete().eq("run_id", run.id);
      await service.from("v1_shopping_entries").delete().eq("run_id", run.id);
      await service.from("v1_maintenance_entries").delete().eq("run_id", run.id);
      await service.from("v1_checklist_runs").delete().eq("id", run.id);
    }

    await service
      .from("v1_events")
      .update({ status: "TODO" })
      .eq("id", eventId);

    await service
      .from("v1_event_exceptions")
      .delete()
      .eq("event_id", eventId)
      .in("status", ["OPEN", "ACKNOWLEDGED"]);

    return new Response(JSON.stringify({ ok: true, event_id: eventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("reset-event-v1 error", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
