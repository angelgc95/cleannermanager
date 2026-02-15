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
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all due SCHEDULED jobs
    const { data: dueJobs, error: fetchError } = await supabase
      .from("notification_jobs")
      .select(
        `*, cleaning_tasks(id, property_id, room_id, start_at, end_at, status, notes, nights_to_show, guests_to_show, 
          properties(name, timezone), rooms(name)),
        profiles:user_id(name, email)`
      )
      .eq("status", "SCHEDULED")
      .lte("scheduled_for", new Date().toISOString())
      .limit(100);

    if (fetchError) throw fetchError;
    if (!dueJobs || dueJobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;

    for (const job of dueJobs) {
      try {
        const task = job.cleaning_tasks as any;

        // If task is DONE or CANCELLED, skip
        if (!task || task.status === "DONE" || task.status === "CANCELLED") {
          await supabase
            .from("notification_jobs")
            .update({ status: "SKIPPED" })
            .eq("id", job.id);
          skipped++;
          continue;
        }

        // For CHECKLIST_2PM: check if checklist is already finished
        if (job.type === "CHECKLIST_2PM") {
          const { data: runs } = await supabase
            .from("checklist_runs")
            .select("finished_at")
            .eq("cleaning_task_id", task.id)
            .not("finished_at", "is", null)
            .limit(1);

          if (runs && runs.length > 0) {
            await supabase
              .from("notification_jobs")
              .update({ status: "SKIPPED" })
              .eq("id", job.id);
            skipped++;
            continue;
          }
        }

        // Check user notification preferences
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("*")
          .eq("user_id", job.user_id)
          .single();

        // Check if this notification type is enabled
        if (prefs) {
          if (job.type === "REMINDER_12H" && !prefs.reminders_12h_enabled) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++;
            continue;
          }
          if (job.type === "REMINDER_1H" && !prefs.reminders_1h_enabled) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++;
            continue;
          }
          if (job.type === "CHECKLIST_2PM" && !prefs.checklist_2pm_enabled) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++;
            continue;
          }
        }

        // Build notification content
        const propertyName = task.properties?.name || "Unknown property";
        const roomName = task.rooms?.name || "All rooms";
        const startTime = task.start_at
          ? new Date(task.start_at).toLocaleString("en-GB", { timeZone: task.properties?.timezone || "UTC" })
          : "N/A";

        let title: string;
        let body: string;
        let link = `/tasks/${task.id}`;

        if (job.type === "REMINDER_12H") {
          title = "🧹 Cleaning in 12 hours";
          body = `${propertyName} — ${roomName}\nStarts: ${startTime}\nNights: ${task.nights_to_show ?? "N/A"} · Guests: ${task.guests_to_show ?? "N/A"}`;
        } else if (job.type === "REMINDER_1H") {
          title = "⏰ Cleaning in 1 hour";
          body = `${propertyName} — ${roomName}\nStarts: ${startTime}\nNights: ${task.nights_to_show ?? "N/A"} · Guests: ${task.guests_to_show ?? "N/A"}`;
        } else {
          title = "📋 Checklist mandatory — submit now";
          body = `${propertyName} — ${roomName}\nYour cleaning checklist has not been submitted yet. Please complete it now.`;
        }

        // Create in-app notification
        if (!prefs || prefs.inapp_enabled !== false) {
          await supabase.from("in_app_notifications").insert({
            user_id: job.user_id,
            title,
            body,
            link,
            notification_job_id: job.id,
          });
        }

        // For CHECKLIST_2PM with manager_cc_enabled, also notify managers
        if (job.type === "CHECKLIST_2PM") {
          const { data: managerPrefs } = await supabase
            .from("notification_preferences")
            .select("user_id, inapp_enabled, manager_cc_enabled")
            .eq("manager_cc_enabled", true);

          if (managerPrefs) {
            for (const mp of managerPrefs) {
              if (mp.user_id === job.user_id) continue;
              // Check if this user is actually a manager/admin
              const { data: hasRole } = await supabase.rpc("has_role", {
                _user_id: mp.user_id,
                _role: "manager",
              });
              const { data: hasAdminRole } = await supabase.rpc("has_role", {
                _user_id: mp.user_id,
                _role: "admin",
              });

              if (hasRole || hasAdminRole) {
                const profile = job.profiles as any;
                await supabase.from("in_app_notifications").insert({
                  user_id: mp.user_id,
                  title: `📋 Checklist overdue: ${profile?.name || "Cleaner"}`,
                  body: `${propertyName} — ${roomName}\nChecklist not submitted by 2 PM.`,
                  link,
                });
              }
            }
          }
        }

        // Mark as SENT
        await supabase
          .from("notification_jobs")
          .update({ status: "SENT", sent_at: new Date().toISOString() })
          .eq("id", job.id);

        processed++;
      } catch (err) {
        // Mark as FAILED with error
        await supabase
          .from("notification_jobs")
          .update({
            status: "FAILED",
            last_error: err instanceof Error ? err.message : String(err),
          })
          .eq("id", job.id);
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, total: dueJobs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
