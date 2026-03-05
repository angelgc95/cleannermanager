import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { cleaning_event_id } = await req.json();
    if (!cleaning_event_id) {
      return new Response(JSON.stringify({ error: "Missing cleaning_event_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is the host of this event
    const { data: eventData, error: eventError } = await serviceClient
      .from("cleaning_events")
      .select("host_user_id")
      .eq("id", cleaning_event_id)
      .single();

    if (eventError || !eventData) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventData.host_user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden: only the host can reset" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all runs for this event
    const { data: allRuns } = await serviceClient
      .from("checklist_runs")
      .select("id")
      .eq("cleaning_event_id", cleaning_event_id);

    const runIds = (allRuns || []).map((r: any) => r.id);

    if (runIds.length > 0) {
      // 1. Collect storage paths from checklist_photos before deleting rows
      const { data: photoRows } = await serviceClient
        .from("checklist_photos")
        .select("photo_url")
        .in("run_id", runIds);

      const storagePaths = (photoRows || [])
        .map((p: any) => p.photo_url)
        .filter((url: string) => url && !url.startsWith("http"));

      // 2. Delete storage objects in batch
      if (storagePaths.length > 0) {
        await serviceClient.storage.from("checklist-photos").remove(storagePaths);
      }

      // 3. Batched deletes using .in() instead of per-run loops
      await serviceClient.from("checklist_photos").delete().in("run_id", runIds);
      await serviceClient.from("checklist_responses").delete().in("run_id", runIds);
      await serviceClient.from("shopping_list").delete().in("checklist_run_id", runIds);
      await serviceClient.from("log_hours").delete().in("checklist_run_id", runIds);
      await serviceClient.from("checklist_runs").delete().in("id", runIds);
    }

    // Reset event
    await serviceClient
      .from("cleaning_events")
      .update({ status: "TODO", checklist_run_id: null })
      .eq("id", cleaning_event_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reset-cleaning-event error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
