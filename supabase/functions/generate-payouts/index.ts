import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Verify host role
    const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
    if (!isHost) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hostUserId = user.id;

    // Get host settings
    const { data: settings } = await supabase
      .from("host_settings")
      .select("payout_frequency, payout_week_end_day, timezone, default_hourly_rate")
      .eq("host_user_id", hostUserId)
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ error: "Host settings not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const weekEndDay = settings.payout_week_end_day ?? 0;

    // Calculate current period boundaries
    const now = new Date();
    const currentDay = now.getDay();
    let daysBack = (currentDay - weekEndDay + 7) % 7;

    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() - daysBack);
    periodEnd.setHours(0, 0, 0, 0);

    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 6);

    const startStr = periodStart.toISOString().split("T")[0];
    const endStr = periodEnd.toISOString().split("T")[0];

    // Check if period exists
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

    // Find all cleaners assigned to this host
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
      // Check if payout already exists
      const { data: existingPayout } = await supabase
        .from("payouts")
        .select("id")
        .eq("period_id", periodId)
        .eq("cleaner_user_id", cleanerId)
        .maybeSingle();

      if (existingPayout) continue;

      // Get unpaid log_hours for this cleaner in the date range
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
        .select("id, duration_minutes, started_at, finished_at, cleaning_task_id, listing_id")
        .eq("cleaner_user_id", cleanerId)
        .eq("host_user_id", hostUserId)
        .not("finished_at", "is", null)
        .not("duration_minutes", "is", null)
        .gte("finished_at", `${startStr}T00:00:00`)
        .lte("finished_at", `${endStr}T23:59:59`);

      // Filter runs that already have log_hours
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

      // Link existing log_hours
      if ((logHours || []).length > 0) {
        await supabase.from("log_hours").update({ payout_id: payout.id }).in("id", logHours!.map((l: any) => l.id));
      }

      // Create log_hours for orphan runs
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
          cleaning_task_id: run.cleaning_task_id,
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
