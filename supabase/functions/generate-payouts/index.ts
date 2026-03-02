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

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
    if (!isHost) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hostUserId = user.id;

    // Accept custom period dates from request body
    let startStr: string;
    let endStr: string;

    try {
      const body = await req.json();
      if (body.start_date && body.end_date) {
        startStr = body.start_date;
        endStr = body.end_date;
      } else {
        return new Response(JSON.stringify({ error: "start_date and end_date are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body. Provide start_date and end_date." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("host_settings")
      .select("default_hourly_rate")
      .eq("host_user_id", hostUserId)
      .single();

    const { data: existingPeriod } = await supabase
      .from("payout_periods")
      .select("id")
      .eq("host_user_id", hostUserId)
      .eq("start_date", startStr)
      .eq("end_date", endStr)
      .maybeSingle();

    let periodId: string;
    if (existingPeriod) {
      periodId = existingPeriod.id;
    } else {
      const { data: newPeriod, error: periodError } = await supabase
        .from("payout_periods")
        .insert({ host_user_id: hostUserId, start_date: startStr, end_date: endStr, status: "OPEN" })
        .select("id").single();
      if (periodError) throw periodError;
      periodId = newPeriod.id;
    }

    const { data: assignments } = await supabase
      .from("cleaner_assignments")
      .select("cleaner_user_id")
      .eq("host_user_id", hostUserId);

    const cleanerIds = [...new Set((assignments || []).map((a: any) => a.cleaner_user_id))];

    if (cleanerIds.length === 0) {
      return new Response(JSON.stringify({ message: "No cleaners assigned", period_id: periodId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payoutsCreated = 0;
    const hourlyRate = settings.default_hourly_rate || 15;

    for (const cleanerId of cleanerIds) {
      const { data: existingPayout } = await supabase
        .from("payouts")
        .select("id")
        .eq("period_id", periodId)
        .eq("cleaner_user_id", cleanerId)
        .maybeSingle();

      if (existingPayout) continue;

      const { data: logHours } = await supabase
        .from("log_hours")
        .select("id, duration_minutes")
        .eq("user_id", cleanerId)
        .eq("host_user_id", hostUserId)
        .is("payout_id", null)
        .gte("date", startStr)
        .lte("date", endStr);

      // Get completed checklist runs without log_hours
      const { data: runs } = await supabase
        .from("checklist_runs")
        .select("id, duration_minutes, started_at, finished_at, cleaning_event_id, listing_id")
        .eq("cleaner_user_id", cleanerId)
        .eq("host_user_id", hostUserId)
        .not("finished_at", "is", null)
        .not("duration_minutes", "is", null)
        .gte("finished_at", `${startStr}T00:00:00`)
        .lte("finished_at", `${endStr}T23:59:59`);

      const { data: existingLogRuns } = await supabase
        .from("log_hours")
        .select("checklist_run_id")
        .eq("user_id", cleanerId)
        .not("checklist_run_id", "is", null);

      const existingRunIds = new Set((existingLogRuns || []).map((l: any) => l.checklist_run_id));
      const orphanRuns = (runs || []).filter((r: any) => !existingRunIds.has(r.id));

      const totalMinutesFromLogs = (logHours || []).reduce((s: number, l: any) => s + (l.duration_minutes || 0), 0);
      const totalMinutesFromRuns = orphanRuns.reduce((s: number, r: any) => s + (r.duration_minutes || 0), 0);
      const totalMinutes = totalMinutesFromLogs + totalMinutesFromRuns;

      if (totalMinutes === 0 && (logHours || []).length === 0 && orphanRuns.length === 0) continue;

      const totalAmount = (totalMinutes / 60) * hourlyRate;

      const { data: payout, error: payoutError } = await supabase
        .from("payouts")
        .insert({
          period_id: periodId,
          cleaner_user_id: cleanerId,
          host_user_id: hostUserId,
          hourly_rate_used: hourlyRate,
          total_minutes: totalMinutes,
          total_amount: totalAmount,
          status: "PENDING",
        })
        .select("id").single();

      if (payoutError) { console.error("Payout error:", payoutError); continue; }

      if ((logHours || []).length > 0) {
        await supabase.from("log_hours").update({ payout_id: payout.id }).in("id", logHours!.map((l: any) => l.id));
      }

      for (const run of orphanRuns) {
        await supabase.from("log_hours").insert({
          user_id: cleanerId,
          host_user_id: hostUserId,
          date: run.finished_at.split("T")[0],
          start_at: run.started_at ? new Date(run.started_at).toTimeString().slice(0, 5) : "09:00",
          end_at: run.finished_at ? new Date(run.finished_at).toTimeString().slice(0, 5) : "17:00",
          duration_minutes: run.duration_minutes,
          source: "CHECKLIST",
          checklist_run_id: run.id,
          cleaning_event_id: run.cleaning_event_id,
          listing_id: run.listing_id || null,
          payout_id: payout.id,
        });
      }

      payoutsCreated++;
    }

    return new Response(
      JSON.stringify({ message: `Generated ${payoutsCreated} payout(s) for ${startStr} to ${endStr}`, period_id: periodId, payouts_created: payoutsCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
