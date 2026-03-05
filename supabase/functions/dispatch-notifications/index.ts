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

    // Authenticate: accept either a valid JWT (host role) or the service role key as Bearer token
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    let authorized = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token === serviceKey) {
        authorized = true;
      } else {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (!userError && user) {
          const svc = createClient(supabaseUrl, serviceKey);
          const { data: isHost } = await svc.rpc("has_role", { _user_id: user.id, _role: "host" });
          if (isHost) authorized = true;
        }
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Atomically claim due jobs (prevents double-send race condition)
    const { data: claimedJobs, error: claimError } = await supabase
      .rpc("claim_notification_jobs", { batch_size: 100 });

    if (claimError) throw new Error(claimError.message);
    if (!claimedJobs || claimedJobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch event data for all claimed jobs
    const eventIds = [...new Set(claimedJobs.map((j: any) => j.cleaning_event_id).filter(Boolean))];
    let eventsMap: Record<string, any> = {};

    if (eventIds.length > 0) {
      const { data: events } = await supabase
        .from("cleaning_events")
        .select("id, listing_id, start_at, end_at, status, notes, event_details_json, listings(name, timezone)")
        .in("id", eventIds);

      for (const ev of (events || [])) {
        eventsMap[ev.id] = ev;
      }
    }

    let processed = 0;
    let skipped = 0;

    for (const job of claimedJobs) {
      try {
        const event = job.cleaning_event_id ? eventsMap[job.cleaning_event_id] : null;

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
        console.error("Job processing error:", err);
        await supabase
          .from("notification_jobs")
          .update({ status: "FAILED", last_error: err instanceof Error ? err.message : String(err) })
          .eq("id", job.id);
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, total: claimedJobs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("dispatch-notifications error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing notifications" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
