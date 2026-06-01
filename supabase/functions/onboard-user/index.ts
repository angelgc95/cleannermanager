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

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "[invalid-email]";
  return `${local.slice(0, 1)}***@${domain}`;
}

function logEvent(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...details }));
}

function logError(event: string, details: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...details }));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let currentAction = "unknown";
  let currentStage = "start";
  let logContext: Record<string, unknown> = {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "No authorization header" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid token" }, 401);
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
      const [{ data: connection, error: connectionError }, { data: assignment, error: assignmentError }] = await Promise.all([
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

      if (connectionError) throw connectionError;
      if (assignmentError) throw assignmentError;
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

    const sendCleanerInviteEmail = async (email: string, redirectTo?: unknown, name = "") => {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: typeof redirectTo === "string" && redirectTo.trim() ? redirectTo.trim() : undefined,
        data: {
          name,
          invite_role: "cleaner",
          invite_expiry_hours: 24,
        },
      });

      if (error) throw error;
      return data;
    };

    const upsertCleanerConnection = async (
      hostUserId: string,
      cleanerUserId: string,
      email: string,
      status: "INVITED" | "ACTIVE",
    ) => {
      const { error } = await supabase
        .from("host_cleaners")
        .upsert(
          {
            host_user_id: hostUserId,
            cleaner_user_id: cleanerUserId,
            invited_email: email,
            status,
          },
          { onConflict: "host_user_id,cleaner_user_id" }
        );

      if (error) throw error;
    };

    const body = await req.json();
    const { type, cleaner_unique_code, cleaner_user_id, cleaner_email, redirect_to } = body;
    currentAction = typeof type === "string" ? type : "unknown";
    logContext = { actor_user_id: user.id };

    if (!type || !["host", "cleaner", "add_cleaner", "invite_cleaner", "remove_cleaner"].includes(type)) {
      return json({ error: "Invalid type" }, 400);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (type === "host") {
      currentStage = "resolve_host_access";
      const [roles, cleanerLinked] = await Promise.all([
        listRoles(user.id),
        hasCleanerLink(user.id),
      ]);
      const normalizedEmail = normalizeEmail(user.email);
      const alreadyHost = roles.some((roleRow) => roleRow.role === "host");

      if (roles.some((roleRow) => roleRow.role === "cleaner") || cleanerLinked) {
        return json({
          error: "This account is already connected as a cleaner. Ask your host to remove the cleaner connection before creating a host account.",
        }, 400);
      }

      if (!alreadyHost) {
        const [adminAccess, pendingInvite] = await Promise.all([
          isPlatformAdmin(user.id),
          getPendingHostInvite(normalizedEmail),
        ]);

        if (!adminAccess && !pendingInvite?.id) {
          return json({
            error: "Host accounts are invitation-only. Ask the owner to approve your email before signing up.",
          }, 403);
        }
      }

      currentStage = "set_host_role";
      await setExclusiveRole(user.id, "host");

      currentStage = "upsert_host_settings";
      const { error: hostSettingsError } = await supabase
        .from("host_settings")
        .upsert({ host_user_id: user.id }, { onConflict: "host_user_id" });
      if (hostSettingsError) throw hostSettingsError;

      if (!alreadyHost && normalizedEmail) {
        currentStage = "accept_host_signup_invite";
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
          logError("host_signup_invite_accept_failed", {
            ...logContext,
            email: maskEmail(normalizedEmail),
            message: acceptInviteError.message,
          });
        }
      }

      logEvent("host_onboarded", { ...logContext, already_host: alreadyHost });
      return json({ success: true, role: "host" });

    } else if (type === "cleaner") {
      // Assign cleaner role
      currentStage = "set_cleaner_role";
      await setExclusiveRole(user.id, "cleaner");

      currentStage = "complete_cleaner_profile";
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ setup_completed: true })
        .eq("user_id", user.id);
      if (profileError) throw profileError;

      // Get the generated unique code
      const { data: profile } = await supabase
        .from("profiles")
        .select("unique_code")
        .eq("user_id", user.id)
        .single();

      return json({ success: true, role: "cleaner", unique_code: profile?.unique_code });

    } else if (type === "add_cleaner") {
      if (!cleaner_unique_code || typeof cleaner_unique_code !== "string" || cleaner_unique_code.length > 20) {
        return json({ error: "Invalid cleaner_unique_code" }, 400);
      }

      // Verify caller is host
      const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
      if (!isHost) {
        return json({ error: "Only hosts can add cleaners" }, 403);
      }

      // Find cleaner by unique code
      const { data: cleanerProfile, error: cleanerErr } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("unique_code", cleaner_unique_code.trim().toUpperCase())
        .single();

      if (cleanerErr || !cleanerProfile) {
        return json({ error: "No cleaner found with that code" }, 404);
      }

      // Verify they have cleaner role
      const { data: isCleaner } = await supabase.rpc("has_role", { _user_id: cleanerProfile.user_id, _role: "cleaner" });
      if (!isCleaner) {
        return json({ error: "This user is not a cleaner" }, 400);
      }

      return json({ success: true, cleaner_user_id: cleanerProfile.user_id, cleaner_name: cleanerProfile.name, cleaner_email: cleanerProfile.email });

    } else if (type === "invite_cleaner") {
      const normalizedEmail = typeof cleaner_email === "string" ? cleaner_email.trim().toLowerCase() : "";
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      logContext = { ...logContext, email: maskEmail(normalizedEmail) };

      if (!emailRegex.test(normalizedEmail)) {
        return json({ error: "Invalid cleaner_email" }, 400);
      }

      currentStage = "verify_host_role";
      const { data: isHost, error: hostRoleError } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
      if (hostRoleError) throw hostRoleError;
      if (!isHost) {
        return json({ error: "Only hosts can invite cleaners" }, 403);
      }

      if ((user.email || "").toLowerCase() === normalizedEmail) {
        return json({ error: "You cannot invite yourself as a cleaner" }, 400);
      }

      currentStage = "find_existing_profile";
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("user_id, name, email, setup_completed")
        .ilike("email", normalizedEmail)
        .maybeSingle();
      if (existingProfileError) throw existingProfileError;

      if (existingProfile?.user_id) {
        currentStage = "verify_existing_cleaner_role";
        const { data: existingIsCleaner, error: existingCleanerRoleError } = await supabase.rpc("has_role", { _user_id: existingProfile.user_id, _role: "cleaner" });
        if (existingCleanerRoleError) throw existingCleanerRoleError;
        if (!existingIsCleaner) {
          return json({ error: "This email already belongs to a non-cleaner account" }, 400);
        }

        currentStage = "check_existing_cleaner_connection";
        const { data: existingConnection, error: existingConnectionError } = await supabase
          .from("host_cleaners")
          .select("host_user_id")
          .eq("cleaner_user_id", existingProfile.user_id)
          .neq("host_user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (existingConnectionError) throw existingConnectionError;

        if (existingConnection?.host_user_id) {
          return json({ error: "This cleaner is already connected to another host" }, 400);
        }

        const cleanerStatus = existingProfile.setup_completed ? "ACTIVE" : "INVITED";
        currentStage = "set_existing_cleaner_role";
        await setExclusiveRole(existingProfile.user_id, "cleaner");

        currentStage = "upsert_existing_cleaner_connection";
        await upsertCleanerConnection(user.id, existingProfile.user_id, normalizedEmail, cleanerStatus);

        let reinvited = false;
        if (!existingProfile.setup_completed) {
          currentStage = "resend_existing_cleaner_invite";
          await sendCleanerInviteEmail(normalizedEmail, redirect_to, existingProfile.name || "");
          reinvited = true;
        }

        logEvent(reinvited ? "cleaner_invite_resent" : "cleaner_linked", {
          ...logContext,
          cleaner_user_id: existingProfile.user_id,
          setup_completed: Boolean(existingProfile.setup_completed),
        });

        return json({
          success: true,
          invited: reinvited,
          reinvited,
          cleaner_user_id: existingProfile.user_id,
          cleaner_name: existingProfile.name,
          cleaner_email: existingProfile.email || normalizedEmail,
          status: cleanerStatus,
        });
      }

      currentStage = "send_new_cleaner_invite";
      const inviteData = await sendCleanerInviteEmail(normalizedEmail, redirect_to);

      const invitedUserId = inviteData.user?.id;
      if (!invitedUserId) {
        return json({ error: "Invite created without a user id" }, 500);
      }

      try {
        currentStage = "check_new_cleaner_connection";
        const { data: existingConnection, error: existingConnectionError } = await supabase
          .from("host_cleaners")
          .select("host_user_id")
          .eq("cleaner_user_id", invitedUserId)
          .neq("host_user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (existingConnectionError) throw existingConnectionError;

        if (existingConnection?.host_user_id) {
          return json({ error: "This cleaner is already connected to another host" }, 400);
        }

        currentStage = "set_new_cleaner_role";
        await setExclusiveRole(invitedUserId, "cleaner");

        currentStage = "upsert_new_cleaner_profile";
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              user_id: invitedUserId,
              name: "",
              email: normalizedEmail,
              setup_completed: false,
            },
            { onConflict: "user_id" }
          );
        if (profileError) throw profileError;

        currentStage = "upsert_new_cleaner_connection";
        await upsertCleanerConnection(user.id, invitedUserId, normalizedEmail, "INVITED");

        logEvent("cleaner_invite_sent", {
          ...logContext,
          cleaner_user_id: invitedUserId,
        });

        return json({
          success: true,
          invited: true,
          reinvited: false,
          cleaner_user_id: invitedUserId,
          cleaner_email: normalizedEmail,
          status: "INVITED",
        });
      } catch (setupError) {
        logError("cleaner_invite_setup_failed", {
          ...logContext,
          stage: currentStage,
          cleaner_user_id: invitedUserId,
          message: getErrorMessage(setupError),
        });

        currentStage = "cleanup_failed_new_cleaner_invite";
        const { error: deleteError } = await supabase.auth.admin.deleteUser(invitedUserId);
        if (deleteError) {
          logError("cleaner_invite_cleanup_failed", {
            ...logContext,
            cleaner_user_id: invitedUserId,
            message: deleteError.message,
          });
        }

        throw setupError;
      }

    } else if (type === "remove_cleaner") {
      if (!cleaner_user_id || !uuidRegex.test(cleaner_user_id)) {
        return json({ error: "Invalid cleaner_user_id" }, 400);
      }

      currentStage = "verify_host_role";
      const { data: isHost, error: hostRoleError } = await supabase
        .rpc("has_role", { _user_id: user.id, _role: "host" });
      if (hostRoleError) throw hostRoleError;
      if (!isHost) {
        return json({ error: "Forbidden" }, 403);
      }

      // Remove all assignments for this cleaner under this host
      currentStage = "remove_cleaner_assignments";
      const { error: assignmentDeleteError } = await supabase.from("cleaner_assignments").delete()
        .eq("cleaner_user_id", cleaner_user_id)
        .eq("host_user_id", user.id);
      if (assignmentDeleteError) throw assignmentDeleteError;

      currentStage = "remove_host_cleaner_connection";
      const { error: connectionDeleteError } = await supabase.from("host_cleaners").delete()
        .eq("cleaner_user_id", cleaner_user_id)
        .eq("host_user_id", user.id);
      if (connectionDeleteError) throw connectionDeleteError;

      logEvent("cleaner_removed", { ...logContext, cleaner_user_id });
      return json({ success: true });
    }

    return json({ error: "Invalid type" }, 400);
  } catch (error) {
    logError("onboard_user_error", {
      ...logContext,
      action: currentAction,
      stage: currentStage,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "An error occurred processing your request" }, 500);
  }
});
