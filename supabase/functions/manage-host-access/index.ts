import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function hasCleanerLink(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: connection }, { data: assignment }] = await Promise.all([
    supabase
      .from("host_cleaners")
      .select("host_user_id")
      .eq("cleaner_user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cleaner_assignments")
      .select("id")
      .eq("cleaner_user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(connection?.host_user_id || assignment?.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (!["check_email", "get_my_invite", "get_admin_status", "list_invites", "authorize_host_email", "revoke_invite"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    if (action === "check_email") {
      const email = normalizeEmail(body.email);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return json({ authorized: false });
      }

      const { data: invite } = await supabase
        .from("host_signup_invites")
        .select("id, status")
        .eq("email", email)
        .eq("status", "PENDING")
        .maybeSingle();

      return json({ authorized: Boolean(invite?.id) });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Invalid token" }, 401);
    }

    if (action === "get_my_invite") {
      const email = normalizeEmail(user.email);
      if (!email) return json({ invite: null });

      const { data: invite } = await supabase
        .from("host_signup_invites")
        .select("id, email, status, created_at, accepted_at")
        .eq("email", email)
        .eq("status", "PENDING")
        .maybeSingle();

      return json({ invite: invite || null });
    }

    const { data: isAdmin } = await supabase.rpc("is_platform_admin", { _user_id: user.id });

    if (action === "get_admin_status") {
      return json({ is_admin: Boolean(isAdmin) });
    }

    if (!isAdmin) {
      return json({ error: "Only platform admins can manage host access." }, 403);
    }

    if (action === "list_invites") {
      const { data: invites, error } = await supabase
        .from("host_signup_invites")
        .select("id, email, status, invited_by_user_id, accepted_by_user_id, created_at, accepted_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return json({ invites: invites || [] });
    }

    if (action === "authorize_host_email") {
      const email = normalizeEmail(body.email);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return json({ error: "Invalid email" }, 400);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

      if (profile?.user_id) {
        const [{ data: existingHostRole }, { data: existingCleanerRole }, cleanerLinked] = await Promise.all([
          supabase.rpc("has_role", {
            _user_id: profile.user_id,
            _role: "host",
          }),
          supabase.rpc("has_role", {
            _user_id: profile.user_id,
            _role: "cleaner",
          }),
          hasCleanerLink(supabase, profile.user_id),
        ]);

        if (existingHostRole) {
          return json({ error: "This email already belongs to a host account." }, 400);
        }

        if (existingCleanerRole || cleanerLinked) {
          return json({ error: "This email is already connected as a cleaner account." }, 400);
        }
      }

      const { error } = await supabase
        .from("host_signup_invites")
        .upsert(
          {
            email,
            invited_by_user_id: user.id,
            status: "PENDING",
            accepted_by_user_id: null,
            accepted_at: null,
          },
          { onConflict: "email" },
        );

      if (error) throw error;
      return json({ success: true, email });
    }

    if (action === "revoke_invite") {
      const inviteId = typeof body.invite_id === "string" ? body.invite_id : "";
      if (!inviteId) {
        return json({ error: "Missing invite_id" }, 400);
      }

      const { error } = await supabase
        .from("host_signup_invites")
        .update({
          status: "REVOKED",
        })
        .eq("id", inviteId)
        .eq("status", "PENDING");

      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error: any) {
    console.error("manage-host-access error:", error);
    return json({ error: error.message || "Unable to process request." }, 500);
  }
});
