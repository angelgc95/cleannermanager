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

    const { type, org_name, invite_code, cleaner_unique_code, cleaner_user_id } = await req.json();

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
      // Cleaner signup: no invite code required, they float without org
      // Assign cleaner role
      await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role: "cleaner" }, { onConflict: "user_id,role" });

      // Get the generated unique code
      const { data: profile } = await supabase
        .from("profiles")
        .select("unique_code")
        .eq("user_id", user.id)
        .single();

      return new Response(
        JSON.stringify({ success: true, role: "cleaner", unique_code: profile?.unique_code }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (type === "add_cleaner") {
      // Admin adds a cleaner to their org by unique_code
      if (!cleaner_unique_code) {
        return new Response(JSON.stringify({ error: "Cleaner unique code is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get admin's org
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!adminProfile?.org_id) {
        return new Response(JSON.stringify({ error: "You must belong to an organization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check admin/manager role
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isAdmin = adminRoles?.some(r => r.role === "admin" || r.role === "manager");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Only admins can add cleaners" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find cleaner by unique code
      const { data: cleanerProfile, error: cleanerErr } = await supabase
        .from("profiles")
        .select("user_id, name, email, org_id")
        .eq("unique_code", cleaner_unique_code.trim().toUpperCase())
        .single();

      if (cleanerErr || !cleanerProfile) {
        return new Response(JSON.stringify({ error: "No cleaner found with that code" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (cleanerProfile.org_id && cleanerProfile.org_id !== adminProfile.org_id) {
        return new Response(JSON.stringify({ error: "This cleaner already belongs to another organization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign cleaner to org
      await supabase
        .from("profiles")
        .update({ org_id: adminProfile.org_id })
        .eq("user_id", cleanerProfile.user_id);

      return new Response(
        JSON.stringify({ success: true, cleaner_name: cleanerProfile.name, cleaner_email: cleanerProfile.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (type === "remove_cleaner") {
      if (!cleaner_user_id) {
        return new Response(JSON.stringify({ error: "cleaner_user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify caller is admin/manager
      const { data: callerProfile } = await supabase.from("profiles").select("org_id").eq("user_id", user.id).single();
      if (!callerProfile?.org_id) {
        return new Response(JSON.stringify({ error: "No organization" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!callerRoles?.some(r => r.role === "admin" || r.role === "manager")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove all assignments
      await supabase.from("cleaner_assignments").delete().eq("cleaner_user_id", cleaner_user_id).eq("org_id", callerProfile.org_id);

      // Set cleaner's org_id to null
      await supabase.from("profiles").update({ org_id: null }).eq("user_id", cleaner_user_id).eq("org_id", callerProfile.org_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
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
