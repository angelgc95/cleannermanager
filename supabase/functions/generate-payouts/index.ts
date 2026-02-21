import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get caller's org or accept org_id in body
    const authHeader = req.headers.get("authorization");
    let orgId: string | null = null;

    const body = await req.json().catch(() => ({}));

    if (body.org_id) {
      orgId = body.org_id;
    } else if (authHeader) {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("user_id", user.id)
          .single();
        orgId = profile?.org_id;
      }
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: "No org_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org settings
    const { data: org } = await supabase
      .from("organizations")
      .select("payout_frequency, payout_week_end_day, timezone")
      .eq("id", orgId)
      .single();

    if (!org) {
      return new Response(JSON.stringify({ error: "Org not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const weekEndDay = org.payout_week_end_day ?? 0; // 0=Sunday

    // Calculate current period boundaries
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sunday

    // Find the most recent end-day (inclusive)
    let daysBack = (currentDay - weekEndDay + 7) % 7;
    if (daysBack === 0 && now.getHours() < 23) {
      // If today is the end day and it's not yet midnight, this period is still active
      daysBack = 0;
    }

    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() - daysBack);
    periodEnd.setHours(0, 0, 0, 0);

    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 6);

    const startStr = periodStart.toISOString().split("T")[0];
    const endStr = periodEnd.toISOString().split("T")[0];

    // Check if this period already exists
    const { data: existingPeriod } = await supabase
      .from("payout_periods")
      .select("id")
      .eq("org_id", orgId)
      .eq("start_date", startStr)
      .eq("end_date", endStr)
      .maybeSingle();

    let periodId: string;

    if (existingPeriod) {
      periodId = existingPeriod.id;
    } else {
      const { data: newPeriod, error: periodError } = await supabase
        .from("payout_periods")
        .insert({
          org_id: orgId,
          start_date: startStr,
          end_date: endStr,
          status: "OPEN",
        })
        .select("id")
        .single();
      if (periodError) throw periodError;
      periodId = newPeriod.id;
    }

    // Find all cleaners in the org
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, hourly_rate_override")
      .eq("org_id", orgId);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No users in org", period_id: periodId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check which are cleaners
    const cleanerProfiles: any[] = [];
    for (const p of profiles) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", p.user_id);
      if (roles?.some((r: any) => r.role === "cleaner")) {
        cleanerProfiles.push(p);
      }
    }

    let payoutsCreated = 0;

    for (const cleaner of cleanerProfiles) {
      // Check if payout already exists for this cleaner+period
      const { data: existingPayout } = await supabase
        .from("payouts")
        .select("id")
        .eq("period_id", periodId)
        .eq("cleaner_user_id", cleaner.user_id)
        .maybeSingle();

      if (existingPayout) continue; // Skip if already exists

      // Get unpaid log_hours for this cleaner in the date range
      const { data: logHours } = await supabase
        .from("log_hours")
        .select("id, duration_minutes")
        .eq("user_id", cleaner.user_id)
        .eq("org_id", orgId)
        .is("payout_id", null)
        .gte("date", startStr)
        .lte("date", endStr);

      // Also get completed tasks assigned to this cleaner with checklist runs
      const { data: tasks } = await supabase
        .from("cleaning_tasks")
        .select("id")
        .eq("assigned_cleaner_user_id", cleaner.user_id)
        .eq("org_id", orgId)
        .eq("status", "DONE");

      const taskIds = (tasks || []).map((t: any) => t.id);
      let orphanRuns: any[] = [];
      if (taskIds.length > 0) {
        const logRunIds = (logHours || []).map(() => null); // We'll check separately
        const { data: runs } = await supabase
          .from("checklist_runs")
          .select("id, cleaning_task_id, duration_minutes, started_at, finished_at, property_id")
          .in("cleaning_task_id", taskIds)
          .not("finished_at", "is", null)
          .not("duration_minutes", "is", null)
          .gte("finished_at", `${startStr}T00:00:00`)
          .lte("finished_at", `${endStr}T23:59:59`);

        // Filter out runs that already have log_hours
        const existingRunIds = new Set(
          ((await supabase
            .from("log_hours")
            .select("checklist_run_id")
            .eq("user_id", cleaner.user_id)
            .not("checklist_run_id", "is", null)
          ).data || []).map((l: any) => l.checklist_run_id)
        );
        orphanRuns = (runs || []).filter((r: any) => !existingRunIds.has(r.id));
      }

      const totalMinutesFromLogs = (logHours || []).reduce((s: number, l: any) => s + (l.duration_minutes || 0), 0);
      const totalMinutesFromRuns = orphanRuns.reduce((s: number, r: any) => s + (r.duration_minutes || 0), 0);
      const totalMinutes = totalMinutesFromLogs + totalMinutesFromRuns;

      if (totalMinutes === 0 && (logHours || []).length === 0 && orphanRuns.length === 0) continue;

      const hourlyRate = cleaner.hourly_rate_override || 15;
      const totalAmount = (totalMinutes / 60) * hourlyRate;

      // Create payout
      const { data: payout, error: payoutError } = await supabase
        .from("payouts")
        .insert({
          period_id: periodId,
          cleaner_user_id: cleaner.user_id,
          hourly_rate_used: hourlyRate,
          total_minutes: totalMinutes,
          total_amount: totalAmount,
          org_id: orgId,
          status: "PENDING",
        })
        .select("id")
        .single();

      if (payoutError) {
        console.error("Payout creation error:", payoutError);
        continue;
      }

      // Link existing log_hours
      if ((logHours || []).length > 0) {
        const logIds = logHours!.map((l: any) => l.id);
        await supabase.from("log_hours").update({ payout_id: payout.id }).in("id", logIds);
      }

      // Create log_hours for orphan runs
      for (const run of orphanRuns) {
        await supabase.from("log_hours").insert({
          user_id: cleaner.user_id,
          date: run.finished_at.split("T")[0],
          start_at: run.started_at ? new Date(run.started_at).toTimeString().slice(0, 5) : "09:00",
          end_at: run.finished_at ? new Date(run.finished_at).toTimeString().slice(0, 5) : "17:00",
          duration_minutes: run.duration_minutes,
          source: "CHECKLIST",
          checklist_run_id: run.id,
          cleaning_task_id: run.cleaning_task_id,
          property_id: run.property_id || null,
          org_id: orgId,
          payout_id: payout.id,
        });
      }

      payoutsCreated++;
    }

    return new Response(
      JSON.stringify({
        message: `Generated ${payoutsCreated} payout(s) for period ${startStr} to ${endStr}`,
        period_id: periodId,
        payouts_created: payoutsCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
