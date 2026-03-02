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
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all due SCHEDULED jobs — now joined to cleaning_events
    const { data: dueJobs, error: fetchError } = await supabase
      .from("notification_jobs")
      .select(
        `*, cleaning_events:cleaning_event_id(id, listing_id, start_at, end_at, status, notes, event_details_json,
          listings(name, timezone))`
      )
      .eq("status", "SCHEDULED")
      .lte("scheduled_for", new Date().toISOString())
      .limit(100);

    if (fetchError) throw new Error(fetchError.message);
    if (!dueJobs || dueJobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;

    for (const job of dueJobs) {
      try {
        const event = (job as any).cleaning_events;

        if (!event || event.status === "DONE" || event.status === "CANCELLED") {
          await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
          skipped++;
          continue;
        }

        // For CHECKLIST_2PM: check if checklist is already finished
        if (job.type === "CHECKLIST_2PM") {
          const { data: runs } = await supabase
            .from("checklist_runs")
            .select("finished_at")
            .eq("cleaning_event_id", event.id)
            .not("finished_at", "is", null)
            .limit(1);

          if (runs && runs.length > 0) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++;
            continue;
          }
        }

        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("*")
          .eq("user_id", job.user_id)
          .single();

        if (prefs) {
          if (job.type === "REMINDER_12H" && !prefs.reminders_12h_enabled) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++; continue;
          }
          if (job.type === "REMINDER_1H" && !prefs.reminders_1h_enabled) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++; continue;
          }
          if (job.type === "CHECKLIST_2PM" && !prefs.checklist_2pm_enabled) {
            await supabase.from("notification_jobs").update({ status: "SKIPPED" }).eq("id", job.id);
            skipped++; continue;
          }
        }

        const listingName = event.listings?.name || "Unknown listing";
        const details = event.event_details_json || {};
        const startTime = event.start_at
          ? new Date(event.start_at).toLocaleString("en-GB", { timeZone: event.listings?.timezone || "UTC" })
          : "N/A";

        let title: string;
        let body: string;
        const link = `/events/${event.id}`;

        if (job.type === "REMINDER_12H") {
          title = "🧹 Cleaning in 12 hours";
          body = `${listingName}\nStarts: ${startTime}\nNights: ${details.nights ?? "N/A"} · Guests: ${details.guests ?? "N/A"}`;
        } else if (job.type === "REMINDER_1H") {
          title = "⏰ Cleaning in 1 hour";
          body = `${listingName}\nStarts: ${startTime}\nNights: ${details.nights ?? "N/A"} · Guests: ${details.guests ?? "N/A"}`;
        } else {
          title = "📋 Checklist mandatory — submit now";
          body = `${listingName}\nYour cleaning checklist has not been submitted yet. Please complete it now.`;
        }

        if (!prefs || prefs.inapp_enabled !== false) {
          await supabase.from("in_app_notifications").insert({
            user_id: job.user_id,
            host_user_id: job.host_user_id,
            title,
            body,
            link,
            notification_job_id: job.id,
          });
        }

        if (job.type === "CHECKLIST_2PM" && job.host_user_id) {
          const { data: cleanerProfile } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", job.user_id)
            .single();

          await supabase.from("in_app_notifications").insert({
            user_id: job.host_user_id,
            host_user_id: job.host_user_id,
            title: `📋 Checklist overdue: ${cleanerProfile?.name || "Cleaner"}`,
            body: `${listingName}\nChecklist not submitted by 2 PM.`,
            link,
          });
        }

        await supabase
          .from("notification_jobs")
          .update({ status: "SENT", sent_at: new Date().toISOString() })
          .eq("id", job.id);

        processed++;
      } catch (err) {
        await supabase
          .from("notification_jobs")
          .update({ status: "FAILED", last_error: err instanceof Error ? err.message : String(err) })
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
