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
    // Gate by CRON_SECRET or service role key
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (token !== serviceKey && token !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    const results: { test: string; passed: boolean; detail?: string }[] = [];

    // Create two test host users via auth.admin
    const testEmailA = `rls-test-a-${Date.now()}@test.local`;
    const testEmailB = `rls-test-b-${Date.now()}@test.local`;

    const { data: userA } = await svc.auth.admin.createUser({
      email: testEmailA,
      password: "TestPass123!",
      email_confirm: true,
    });
    const { data: userB } = await svc.auth.admin.createUser({
      email: testEmailB,
      password: "TestPass123!",
      email_confirm: true,
    });

    if (!userA?.user || !userB?.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create test users", results }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uidA = userA.user.id;
    const uidB = userB.user.id;

    try {
      // Assign host roles
      await svc.from("user_roles").insert([
        { user_id: uidA, role: "host" },
        { user_id: uidB, role: "host" },
      ]);

      // Create a listing for host A
      const { data: listingA } = await svc.from("listings").insert({
        host_user_id: uidA,
        name: "RLS Test Listing A",
      }).select("id").single();

      if (!listingA) throw new Error("Failed to create test listing");

      // Create a cleaning event for host A
      const { data: eventA } = await svc.from("cleaning_events").insert({
        host_user_id: uidA,
        listing_id: listingA.id,
        status: "TODO",
      }).select("id").single();

      if (!eventA) throw new Error("Failed to create test event");

      // Create a maintenance ticket for host A
      const { data: ticketA } = await svc.from("maintenance_tickets").insert({
        host_user_id: uidA,
        created_by_user_id: uidA,
        issue: "RLS test issue",
      }).select("id").single();

      // Sign in as host B and query host A's data
      const clientB = createClient(supabaseUrl, anonKey);
      const { data: sessionB } = await clientB.auth.signInWithPassword({
        email: testEmailB,
        password: "TestPass123!",
      });

      if (!sessionB?.session) throw new Error("Failed to sign in as test user B");

      // Test 1: Host B cannot see Host A's cleaning events
      const { data: eventsForB } = await clientB
        .from("cleaning_events")
        .select("id")
        .eq("id", eventA.id);

      results.push({
        test: "cleaning_events: Host B cannot see Host A's events",
        passed: (eventsForB || []).length === 0,
        detail: `Returned ${(eventsForB || []).length} rows (expected 0)`,
      });

      // Test 2: Host B cannot see Host A's maintenance tickets
      if (ticketA) {
        const { data: ticketsForB } = await clientB
          .from("maintenance_tickets")
          .select("id")
          .eq("id", ticketA.id);

        results.push({
          test: "maintenance_tickets: Host B cannot see Host A's tickets",
          passed: (ticketsForB || []).length === 0,
          detail: `Returned ${(ticketsForB || []).length} rows (expected 0)`,
        });
      }

      // Test 3: Host B cannot see Host A's listings
      const { data: listingsForB } = await clientB
        .from("listings")
        .select("id")
        .eq("id", listingA.id);

      results.push({
        test: "listings: Host B cannot see Host A's listings",
        passed: (listingsForB || []).length === 0,
        detail: `Returned ${(listingsForB || []).length} rows (expected 0)`,
      });

      // Cleanup
      if (ticketA) await svc.from("maintenance_tickets").delete().eq("id", ticketA.id);
      await svc.from("cleaning_events").delete().eq("id", eventA.id);
      await svc.from("listings").delete().eq("id", listingA.id);
    } finally {
      // Always clean up users
      await svc.from("user_roles").delete().eq("user_id", uidA);
      await svc.from("user_roles").delete().eq("user_id", uidB);
      await svc.from("profiles").delete().eq("user_id", uidA);
      await svc.from("profiles").delete().eq("user_id", uidB);
      await svc.auth.admin.deleteUser(uidA);
      await svc.auth.admin.deleteUser(uidB);
    }

    const allPassed = results.every((r) => r.passed);

    return new Response(
      JSON.stringify({ passed: allPassed, results }),
      {
        status: allPassed ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("rls-smoke-test error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
