import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildWeeklyRange, generatePayoutsForHost, getLocalTimeContext } from "../_shared/payouts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret");

    if (!cronSecret || providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();

    const { data: hosts, error: hostError } = await supabase
      .from("host_settings")
      .select("host_user_id, payout_frequency, payout_week_end_day, payout_shortcut_enabled, payout_run_time, payout_run_timezone")
      .eq("payout_shortcut_enabled", true);

    if (hostError) throw hostError;

    const processed: any[] = [];

    for (const host of hosts || []) {
      if (host.payout_frequency !== "WEEKLY") continue;

      const local = getLocalTimeContext(now, host.payout_run_timezone || "Europe/Madrid");
      const [runHour, runMinute] = String(host.payout_run_time || "17:00:00")
        .split(":")
        .slice(0, 2)
        .map(Number);

      const localMinutes = local.hour * 60 + local.minute;
      const scheduledMinutes = runHour * 60 + runMinute;

      if (local.weekdayIndex !== Number(host.payout_week_end_day ?? 0)) continue;
      // GitHub Actions runs every 5 minutes, so only trigger inside the next 5-minute slot.
      if (localMinutes < scheduledMinutes || localMinutes >= scheduledMinutes + 5) continue;

      const { startStr, endStr } = buildWeeklyRange(local.date);
      const result = await generatePayoutsForHost({
        supabase,
        hostUserId: host.host_user_id,
        startStr,
        endStr,
      });

      processed.push({
        host_user_id: host.host_user_id,
        period_id: result.periodId,
        payouts_created: result.payoutsCreated,
        start_date: startStr,
        end_date: endStr,
      });
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("run-scheduled-payouts error:", error);
    return new Response(JSON.stringify({ error: "An error occurred running scheduled payouts" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
