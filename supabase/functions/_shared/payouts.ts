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

export type PayoutModel = "HOURLY" | "PER_EVENT_PLUS_HOURLY";

function normalizePayoutModel(value: string | null | undefined): PayoutModel {
  return value === "PER_EVENT_PLUS_HOURLY" ? "PER_EVENT_PLUS_HOURLY" : "HOURLY";
}

function includeUnpaidOrCurrent(query: any, currentPayoutId: string | null) {
  if (!currentPayoutId) return query.is("payout_id", null);
  return query.or(`payout_id.is.null,payout_id.eq.${currentPayoutId}`);
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
    .select("default_hourly_rate, payout_model, default_event_rate")
    .eq("host_user_id", hostUserId)
    .single();

  const payoutModel = normalizePayoutModel(settings?.payout_model);
  const hourlyRate = Number(settings?.default_hourly_rate || 15);
  const eventRate = Number(settings?.default_event_rate || 0);

  if (payoutModel === "PER_EVENT_PLUS_HOURLY" && eventRate <= 0) {
    throw new Error("Set a per-event rate before generating payouts.");
  }

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

  for (const cleanerId of cleanerIds) {
    const { data: existingPayout } = await supabase
      .from("payouts")
      .select("id, status, partial_paid_amount, manual_adjustment_amount")
      .eq("period_id", periodId)
      .eq("cleaner_user_id", cleanerId)
      .maybeSingle();

    if (existingPayout?.status === "PAID") continue;
    const currentPayoutId = existingPayout?.id || null;

    const logHoursQuery = supabase
      .from("log_hours")
      .select("id, duration_minutes, checklist_run_id, cleaning_event_id")
      .eq("user_id", cleanerId)
      .eq("host_user_id", hostUserId)
      .gte("date", startStr)
      .lte("date", endStr);

    const { data: logHours } = await includeUnpaidOrCurrent(logHoursQuery, currentPayoutId);

    const cleaningEventsQuery = supabase
      .from("cleaning_events")
      .select("id, checklist_run_id, status")
      .eq("assigned_cleaner_id", cleanerId)
      .eq("host_user_id", hostUserId)
      .neq("status", "CANCELLED")
      .gte("start_at", `${startStr}T00:00:00`)
      .lte("start_at", `${endStr}T23:59:59`);

    const { data: cleaningEvents } = await includeUnpaidOrCurrent(cleaningEventsQuery, currentPayoutId);
    const cleaningEventIds = (cleaningEvents || []).map((event: any) => event.id);

    let eventRuns: any[] = [];
    if (cleaningEventIds.length > 0) {
      const eventRunsQuery = supabase
        .from("checklist_runs")
        .select("id, cleaning_event_id, duration_minutes, finished_at, payout_id")
        .eq("cleaner_user_id", cleanerId)
        .eq("host_user_id", hostUserId)
        .in("cleaning_event_id", cleaningEventIds);

      const { data } = await includeUnpaidOrCurrent(eventRunsQuery, currentPayoutId);
      eventRuns = data || [];
    }

    const latestRunByEvent = new Map<string, any>();
    for (const run of eventRuns) {
      if (!run.cleaning_event_id) continue;
      latestRunByEvent.set(run.cleaning_event_id, run);
    }

    const payableEvents =
      payoutModel === "PER_EVENT_PLUS_HOURLY"
        ? (cleaningEvents || []).filter((event: any) => {
            const run = latestRunByEvent.get(event.id);
            return event.status === "DONE" || Boolean(run?.finished_at);
          })
        : [];

    const payableEventIds = payableEvents.map((event: any) => event.id);
    const payableRunIds = payableEvents
      .map((event: any) => event.checklist_run_id || latestRunByEvent.get(event.id)?.id)
      .filter(Boolean);

    const finishedRunsQuery = supabase
      .from("checklist_runs")
      .select("id, duration_minutes")
      .eq("cleaner_user_id", cleanerId)
      .eq("host_user_id", hostUserId)
      .not("finished_at", "is", null)
      .gte("finished_at", `${startStr}T00:00:00`)
      .lte("finished_at", `${endStr}T23:59:59`);

    const { data: finishedRuns } = await includeUnpaidOrCurrent(finishedRunsQuery, currentPayoutId);
    const hourlyRunIds = new Set((finishedRuns || []).map((run: any) => run.id));
    const eventRunIds = new Set(payableRunIds);
    const manualHourEntries: any[] = [];
    const checklistHourEntries: any[] = [];
    const orphanChecklistHourEntries: any[] = [];

    for (const entry of logHours || []) {
      if (entry.checklist_run_id) {
        if (eventRunIds.has(entry.checklist_run_id) || hourlyRunIds.has(entry.checklist_run_id)) {
          checklistHourEntries.push(entry);
        } else {
          orphanChecklistHourEntries.push(entry);
        }
      } else {
        manualHourEntries.push(entry);
      }
    }

    const eventCount = payoutModel === "PER_EVENT_PLUS_HOURLY" ? payableEvents.length : 0;
    const checklistMinutesFromLogs = checklistHourEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration_minutes || 0),
      0
    );
    const checklistMinutesFromRuns = (finishedRuns || []).reduce(
      (sum: number, run: any) => sum + (run.duration_minutes || 0),
      0
    );
    const checklistMinutes = checklistMinutesFromLogs || checklistMinutesFromRuns;
    const manualMinutes = manualHourEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration_minutes || 0),
      0
    );
    const orphanChecklistMinutes = orphanChecklistHourEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration_minutes || 0),
      0
    );
    const hourlyMinutes =
      payoutModel === "HOURLY"
        ? manualMinutes + checklistMinutes + orphanChecklistMinutes
        : manualMinutes + orphanChecklistMinutes;

    if (eventCount === 0 && hourlyMinutes === 0) continue;

    const totalAmount =
      payoutModel === "HOURLY"
        ? (hourlyMinutes / 60) * hourlyRate
        : eventCount * eventRate + (hourlyMinutes / 60) * hourlyRate;

    const manualAdjustmentAmount = Number(existingPayout?.manual_adjustment_amount || 0);
    const payoutPayload = {
      period_id: periodId,
      cleaner_user_id: cleanerId,
      host_user_id: hostUserId,
      hourly_rate_used: hourlyRate,
      payout_model: payoutModel,
      event_count: eventCount,
      event_rate_used: payoutModel === "PER_EVENT_PLUS_HOURLY" ? eventRate : null,
      total_minutes: hourlyMinutes,
      calculated_amount: totalAmount,
      manual_adjustment_amount: manualAdjustmentAmount,
      total_amount: totalAmount + manualAdjustmentAmount,
      status: existingPayout?.status || "PENDING",
      partial_paid_amount:
        existingPayout?.status === "PARTIALLY_PAID" ? existingPayout.partial_paid_amount : null,
    };

    const payoutRequest = existingPayout
      ? supabase.from("payouts").update(payoutPayload).eq("id", existingPayout.id)
      : supabase.from("payouts").insert(payoutPayload);

    const { data: payout, error: payoutError } = await payoutRequest.select("id").single();

    if (payoutError) {
      console.error("Payout error:", payoutError);
      continue;
    }

    if (currentPayoutId) {
      await supabase.from("log_hours").update({ payout_id: null }).eq("payout_id", currentPayoutId);
      await supabase.from("checklist_runs").update({ payout_id: null }).eq("payout_id", currentPayoutId);
      await supabase.from("cleaning_events").update({ payout_id: null }).eq("payout_id", currentPayoutId);
    }

    const logHourIds = [
      ...manualHourEntries.map((entry: any) => entry.id),
      ...checklistHourEntries.map((entry: any) => entry.id),
      ...orphanChecklistHourEntries.map((entry: any) => entry.id),
    ];

    if (logHourIds.length > 0) {
      await supabase
        .from("log_hours")
        .update({ payout_id: payout.id })
        .in("id", logHourIds);
    }

    if (payableRunIds.length > 0) {
      await supabase
        .from("checklist_runs")
        .update({ payout_id: payout.id })
        .in("id", payableRunIds);
    }

    if (payableEventIds.length > 0) {
      await supabase
        .from("cleaning_events")
        .update({ payout_id: payout.id })
        .in("id", payableEventIds);
    }

    payoutsCreated++;
  }

  return {
    periodId,
    payoutsCreated,
    message: `Generated ${payoutsCreated} payout(s) for ${startStr} to ${endStr}`,
  };
}
