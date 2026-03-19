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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    type AppRole = "host" | "cleaner";
    const normalizeEmail = (value?: string | null) => (value || "").trim().toLowerCase();

    const listRoles = async (userId: string) => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, role")
        .eq("user_id", userId);

      if (error) throw error;
      return (data || []) as { id: string; role: AppRole }[];
    };

    const hasCleanerLink = async (userId: string) => {
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
    };

    const setExclusiveRole = async (userId: string, nextRole: AppRole) => {
      const roleRows = await listRoles(userId);
      const keeper = roleRows.find((roleRow) => roleRow.role === nextRole) || roleRows[0] || null;

      if (keeper) {
        if (keeper.role !== nextRole) {
          const { error } = await supabase
            .from("user_roles")
            .update({ role: nextRole })
            .eq("id", keeper.id);
          if (error) throw error;
        }

        const extraIds = roleRows
          .filter((roleRow) => roleRow.id !== keeper.id)
          .map((roleRow) => roleRow.id);

        if (extraIds.length > 0) {
          const { error } = await supabase
            .from("user_roles")
            .delete()
            .in("id", extraIds);
          if (error) throw error;
        }

        return;
      }

      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: nextRole });

      if (error) throw error;
    };

    const isPlatformAdmin = async (userId: string) => {
      const { data, error } = await supabase.rpc("is_platform_admin", { _user_id: userId });
      if (error) throw error;
      return Boolean(data);
    };

    const getPendingHostInvite = async (email: string) => {
      if (!email) return null;

      const { data, error } = await supabase
        .from("host_signup_invites")
        .select("id, status")
        .eq("email", email)
        .eq("status", "PENDING")
        .maybeSingle();

      if (error) throw error;
      return data;
    };

    const body = await req.json();
    const { type, cleaner_unique_code, cleaner_user_id, cleaner_email, redirect_to } = body;

    if (!type || !["host", "cleaner", "add_cleaner", "invite_cleaner", "remove_cleaner"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (type === "host") {
      const [roles, cleanerLinked] = await Promise.all([
        listRoles(user.id),
        hasCleanerLink(user.id),
      ]);
      const normalizedEmail = normalizeEmail(user.email);
      const alreadyHost = roles.some((roleRow) => roleRow.role === "host");

      if (roles.some((roleRow) => roleRow.role === "cleaner") || cleanerLinked) {
        return new Response(JSON.stringify({
          error: "This account is already connected as a cleaner. Ask your host to remove the cleaner connection before creating a host account.",
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!alreadyHost) {
        const [adminAccess, pendingInvite] = await Promise.all([
          isPlatformAdmin(user.id),
          getPendingHostInvite(normalizedEmail),
        ]);

        if (!adminAccess && !pendingInvite?.id) {
          return new Response(JSON.stringify({
            error: "Host accounts are invitation-only. Ask the owner to approve your email before signing up.",
          }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      await setExclusiveRole(user.id, "host");

      const { error: hostSettingsError } = await supabase
        .from("host_settings")
        .upsert({ host_user_id: user.id }, { onConflict: "host_user_id" });
      if (hostSettingsError) throw hostSettingsError;

      if (!alreadyHost && normalizedEmail) {
        const { error: acceptInviteError } = await supabase
          .from("host_signup_invites")
          .update({
            status: "ACCEPTED",
            accepted_by_user_id: user.id,
            accepted_at: new Date().toISOString(),
          })
          .eq("email", normalizedEmail)
          .eq("status", "PENDING");

        if (acceptInviteError) {
          console.error("Failed to accept host signup invite", acceptInviteError);
        }
      }

      return new Response(
        JSON.stringify({ success: true, role: "host" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (type === "cleaner") {
      // Assign cleaner role
      await setExclusiveRole(user.id, "cleaner");

      await supabase
        .from("profiles")
        .update({ setup_completed: true })
        .eq("user_id", user.id);

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
      if (!cleaner_unique_code || typeof cleaner_unique_code !== "string" || cleaner_unique_code.length > 20) {
        return new Response(JSON.stringify({ error: "Invalid cleaner_unique_code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify caller is host
      const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
      if (!isHost) {
        return new Response(JSON.stringify({ error: "Only hosts can add cleaners" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find cleaner by unique code
      const { data: cleanerProfile, error: cleanerErr } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("unique_code", cleaner_unique_code.trim().toUpperCase())
        .single();

      if (cleanerErr || !cleanerProfile) {
        return new Response(JSON.stringify({ error: "No cleaner found with that code" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify they have cleaner role
      const { data: isCleaner } = await supabase.rpc("has_role", { _user_id: cleanerProfile.user_id, _role: "cleaner" });
      if (!isCleaner) {
        return new Response(JSON.stringify({ error: "This user is not a cleaner" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, cleaner_user_id: cleanerProfile.user_id, cleaner_name: cleanerProfile.name, cleaner_email: cleanerProfile.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (type === "invite_cleaner") {
      const normalizedEmail = typeof cleaner_email === "string" ? cleaner_email.trim().toLowerCase() : "";
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(normalizedEmail)) {
        return new Response(JSON.stringify({ error: "Invalid cleaner_email" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
      if (!isHost) {
        return new Response(JSON.stringify({ error: "Only hosts can invite cleaners" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if ((user.email || "").toLowerCase() === normalizedEmail) {
        return new Response(JSON.stringify({ error: "You cannot invite yourself as a cleaner" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("user_id, name, email, setup_completed")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (existingProfile?.user_id) {
        const { data: existingIsCleaner } = await supabase.rpc("has_role", { _user_id: existingProfile.user_id, _role: "cleaner" });
        if (!existingIsCleaner) {
          return new Response(JSON.stringify({ error: "This email already belongs to a non-cleaner account" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: existingConnection } = await supabase
          .from("host_cleaners")
          .select("host_user_id")
          .eq("cleaner_user_id", existingProfile.user_id)
          .neq("host_user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (existingConnection?.host_user_id) {
          return new Response(JSON.stringify({ error: "This cleaner is already connected to another host" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const cleanerStatus = existingProfile.setup_completed ? "ACTIVE" : "INVITED";
        await setExclusiveRole(existingProfile.user_id, "cleaner");

        await supabase
          .from("host_cleaners")
          .upsert(
            {
              host_user_id: user.id,
              cleaner_user_id: existingProfile.user_id,
              invited_email: normalizedEmail,
              status: cleanerStatus,
            },
            { onConflict: "host_user_id,cleaner_user_id" }
          );

        return new Response(
          JSON.stringify({
            success: true,
            invited: false,
            cleaner_user_id: existingProfile.user_id,
            cleaner_name: existingProfile.name,
            cleaner_email: existingProfile.email || normalizedEmail,
            status: cleanerStatus,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo: typeof redirect_to === "string" && redirect_to.trim() ? redirect_to.trim() : undefined,
        data: { name: "" },
      });

      if (inviteError) {
        throw inviteError;
      }

      const invitedUserId = inviteData.user?.id;
      if (!invitedUserId) {
        return new Response(JSON.stringify({ error: "Invite created without a user id" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingConnection } = await supabase
        .from("host_cleaners")
        .select("host_user_id")
        .eq("cleaner_user_id", invitedUserId)
        .neq("host_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (existingConnection?.host_user_id) {
        return new Response(JSON.stringify({ error: "This cleaner is already connected to another host" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await setExclusiveRole(invitedUserId, "cleaner");

      await supabase
        .from("profiles")
        .update({
          name: "",
          email: normalizedEmail,
          setup_completed: false,
        })
        .eq("user_id", invitedUserId);

      await supabase
        .from("host_cleaners")
        .upsert(
          {
            host_user_id: user.id,
            cleaner_user_id: invitedUserId,
            invited_email: normalizedEmail,
            status: "INVITED",
          },
          { onConflict: "host_user_id,cleaner_user_id" }
        );

      return new Response(
        JSON.stringify({
          success: true,
          invited: true,
          cleaner_user_id: invitedUserId,
          cleaner_email: normalizedEmail,
          status: "INVITED",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (type === "remove_cleaner") {
      if (!cleaner_user_id || !uuidRegex.test(cleaner_user_id)) {
        return new Response(JSON.stringify({ error: "Invalid cleaner_user_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
      if (!isHost) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove all assignments for this cleaner under this host
      await supabase.from("cleaner_assignments").delete()
        .eq("cleaner_user_id", cleaner_user_id)
        .eq("host_user_id", user.id);

      await supabase.from("host_cleaners").delete()
        .eq("cleaner_user_id", cleaner_user_id)
        .eq("host_user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid type" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("onboard-user error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
