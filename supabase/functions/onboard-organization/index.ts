import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const user = userData.user;
    const body = await req.json().catch(() => ({}));
    const organizationName = (body?.organization_name as string | undefined)?.trim() || `${user.email?.split("@")[0] || "New"} Organization`;

    const { data: existingMembership } = await service
      .from("v1_organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingMembership) {
      return new Response(
        JSON.stringify({
          organization_id: existingMembership.organization_id,
          role: existingMembership.role,
          created: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: org, error: orgError } = await service
      .from("v1_organizations")
      .insert({
        name: organizationName,
        billing_tier: "FREE",
        listing_limit: 3,
      })
      .select("id, name")
      .single();

    if (orgError || !org) {
      throw orgError || new Error("Failed to create organization");
    }

    const { error: memberError } = await service
      .from("v1_organization_members")
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: "OWNER",
      });
    if (memberError) throw memberError;

    const { error: roleError } = await service
      .from("v1_role_assignments")
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: "OWNER",
        scope_type: "ORG",
        scope_id: null,
      });
    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({
        organization_id: org.id,
        role: "OWNER",
        created: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("onboard-organization error", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
