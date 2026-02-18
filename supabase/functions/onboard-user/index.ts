import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, org_name, invite_code } = await req.json();

    if (type === "host") {
      // Create organization
      const orgName = org_name || user.user_metadata?.name || "My Organization";
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: orgName })
        .select()
        .single();

      if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`);

      // Update profile with org_id
      await supabase
        .from("profiles")
        .update({ org_id: org.id })
        .eq("user_id", user.id);

      // Assign admin role
      await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });

      return new Response(
        JSON.stringify({ success: true, org_id: org.id, invite_code: org.invite_code, role: "admin" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (type === "cleaner") {
      if (!invite_code) {
        return new Response(JSON.stringify({ error: "Invite code is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate invite code
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("invite_code", invite_code)
        .single();

      if (orgError || !org) {
        return new Response(JSON.stringify({ error: "Invalid invite code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile with org_id
      await supabase
        .from("profiles")
        .update({ org_id: org.id })
        .eq("user_id", user.id);

      // Assign cleaner role
      await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role: "cleaner" }, { onConflict: "user_id,role" });

      return new Response(
        JSON.stringify({ success: true, org_id: org.id, org_name: org.name, role: "cleaner" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use 'host' or 'cleaner'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
