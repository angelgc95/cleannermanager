export interface GeneratePayoutsForHostArgs {
  supabase: any;
  hostUserId: string;
  startStr: string;
  endStr: string;
}

export interface GeneratePayoutsForHostResult {
  periodId: string;
  payoutsCreated: number;
  message: string;
}

export function getLocalTimeContext(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekday = lookup("weekday");
  const weekdayIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(weekday);

  return {
    date: `${lookup("year")}-${lookup("month")}-${lookup("day")}`,
    hour: Number(lookup("hour")),
    minute: Number(lookup("minute")),
    weekdayIndex,
  };
}

export function buildWeeklyRange(endDateStr: string) {
  const endDate = new Date(`${endDateStr}T00:00:00Z`);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);

  return {
    startStr: startDate.toISOString().slice(0, 10),
    endStr: endDate.toISOString().slice(0, 10),
  };
}

export async function generatePayoutsForHost({
  supabase,
  hostUserId,
  startStr,
  endStr,
}: GeneratePayoutsForHostArgs): Promise<GeneratePayoutsForHostResult> {
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
      .insert({
        host_user_id: hostUserId,
        start_date: startStr,
        end_date: endStr,
        status: "OPEN",
      })
      .select("id")
      .single();

    if (periodError) throw periodError;
    periodId = newPeriod.id;
  }

  const { data: assignments } = await supabase
    .from("cleaner_assignments")
    .select("cleaner_user_id")
    .eq("host_user_id", hostUserId);

  const cleanerIds = [...new Set((assignments || []).map((assignment: any) => assignment.cleaner_user_id))];
  if (cleanerIds.length === 0) {
    return {
      periodId,
      payoutsCreated: 0,
      message: "No cleaners assigned",
    };
  }

  let payoutsCreated = 0;
  const hourlyRate = settings?.default_hourly_rate || 15;

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

    const existingRunIds = new Set((existingLogRuns || []).map((entry: any) => entry.checklist_run_id));
    const orphanRuns = (runs || []).filter((run: any) => !existingRunIds.has(run.id));

    const totalMinutesFromLogs = (logHours || []).reduce((sum: number, entry: any) => sum + (entry.duration_minutes || 0), 0);
    const totalMinutesFromRuns = orphanRuns.reduce((sum: number, run: any) => sum + (run.duration_minutes || 0), 0);
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
      .select("id")
      .single();

    if (payoutError) {
      console.error("Payout error:", payoutError);
      continue;
    }

    if ((logHours || []).length > 0) {
      await supabase.from("log_hours").update({ payout_id: payout.id }).in("id", logHours.map((entry: any) => entry.id));
    }

    if (orphanRuns.length > 0) {
      const orphanRows = orphanRuns.map((run: any) => ({
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
      }));
      await supabase.from("log_hours").insert(orphanRows);
    }

    payoutsCreated++;
  }

  return {
    periodId,
    payoutsCreated,
    message: `Generated ${payoutsCreated} payout(s) for ${startStr} to ${endStr}`,
  };
}
