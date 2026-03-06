import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
};

type ParsedEvent = {
  uid: string;
  dtStartRaw: string;
  dtStartTzid: string | null;
  dtStartHasTime: boolean;
  dtEndRaw: string;
  dtEndTzid: string | null;
  status: "CONFIRMED" | "CANCELLED";
};

type ParsedIcsValue =
  | {
    kind: "date";
    year: number;
    month: number;
    day: number;
  }
  | {
    kind: "date-time";
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    isUtc: boolean;
  };

type ListingRow = {
  id: string;
  organization_id: string;
  ical_url: string | null;
  active: boolean;
  checkin_time_local: string;
  timezone: string;
};

function unfoldIcs(input: string): string {
  return input.replace(/\r?\n[ \t]/g, "");
}

function extractParamValue(paramsRaw: string, key: string): string | null {
  const pieces = paramsRaw.split(";").map((entry) => entry.trim()).filter(Boolean);
  for (const piece of pieces) {
    const [paramKey, ...rest] = piece.split("=");
    if (!paramKey || rest.length === 0) continue;
    if (paramKey.toUpperCase() === key.toUpperCase()) {
      return rest.join("=");
    }
  }
  return null;
}

function parseIcs(ics: string): ParsedEvent[] {
  const text = unfoldIcs(ics);
  const chunks = text.split("BEGIN:VEVENT").slice(1);
  const parsed: ParsedEvent[] = [];

  for (const chunk of chunks) {
    const block = chunk.split("END:VEVENT")[0] || "";
    const uid = block.match(/^UID[:;](.*)$/m)?.[1]?.trim() || "";

    const dtStartMatch = block.match(/^DTSTART(?:;([^:]*))?:(.*)$/m);
    const dtEndMatch = block.match(/^DTEND(?:;([^:]*))?:(.*)$/m);

    const dtStartParams = dtStartMatch?.[1] || "";
    const dtEndParams = dtEndMatch?.[1] || "";

    const dtStartRaw = dtStartMatch?.[2]?.trim() || "";
    const dtEndRaw = dtEndMatch?.[2]?.trim() || "";

    const statusRaw = (block.match(/^STATUS[:;](.*)$/m)?.[1]?.trim() || "CONFIRMED").toUpperCase();

    if (!uid || !dtStartRaw) continue;

    parsed.push({
      uid,
      dtStartRaw,
      dtStartTzid: extractParamValue(dtStartParams, "TZID"),
      dtStartHasTime: dtStartRaw.includes("T"),
      dtEndRaw,
      dtEndTzid: extractParamValue(dtEndParams, "TZID"),
      status: statusRaw === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    });
  }

  return parsed;
}

function parseIcsValue(raw: string): ParsedIcsValue | null {
  const clean = raw.trim().toUpperCase();

  const dateMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    return {
      kind: "date",
      year: Number(dateMatch[1]),
      month: Number(dateMatch[2]),
      day: Number(dateMatch[3]),
    };
  }

  const dateTimeMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (dateTimeMatch) {
    return {
      kind: "date-time",
      year: Number(dateTimeMatch[1]),
      month: Number(dateTimeMatch[2]),
      day: Number(dateTimeMatch[3]),
      hour: Number(dateTimeMatch[4]),
      minute: Number(dateTimeMatch[5]),
      second: Number(dateTimeMatch[6] || "0"),
      isUtc: !!dateTimeMatch[7],
    };
  }

  return null;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    // Throws on invalid IANA timezone.
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimeZone(input: string | null | undefined): { timeZone: string; fellBack: boolean } {
  const candidate = (input || "").trim() || "UTC";
  if (isValidTimeZone(candidate)) {
    return { timeZone: candidate, fellBack: false };
  }
  return { timeZone: "UTC", fellBack: true };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function partsToYmd(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function normalizeCheckinTime(input: string | null | undefined): { hour: number; minute: number } {
  const text = (input || "").trim();
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return { hour: 15, minute: 0 };
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function formatToPartsInTimeZone(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const pieces = dtf.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const piece of pieces) {
    if (piece.type === "literal") continue;
    map[piece.type] = Number(piece.value);
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function zonedDateTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): string {
  let guessMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Iteratively converge to the UTC instant that renders as the desired local datetime in target TZ.
  for (let idx = 0; idx < 5; idx += 1) {
    const rendered = formatToPartsInTimeZone(new Date(guessMs), timeZone);

    const desiredMinutes = Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 60000);
    const renderedMinutes = Math.floor(
      Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second) / 60000,
    );

    const deltaMinutes = desiredMinutes - renderedMinutes;
    if (deltaMinutes === 0) {
      break;
    }

    guessMs += deltaMinutes * 60 * 1000;
  }

  return new Date(guessMs).toISOString();
}

function parseIcsInstantToUtc(
  raw: string,
  tzid: string | null,
  fallbackTimeZone: string,
): string | null {
  const parsed = parseIcsValue(raw);
  if (!parsed) return null;

  if (parsed.kind === "date") {
    return zonedDateTimeToUtcIso(parsed.year, parsed.month, parsed.day, 0, 0, 0, fallbackTimeZone);
  }

  if (parsed.isUtc) {
    return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second)).toISOString();
  }

  const sourceTimeZone = normalizeTimeZone(tzid || fallbackTimeZone).timeZone;
  return zonedDateTimeToUtcIso(
    parsed.year,
    parsed.month,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
    sourceTimeZone,
  );
}

function getDateInTimeZone(utcIso: string, timeZone: string): string {
  const parts = formatToPartsInTimeZone(new Date(utcIso), timeZone);
  return partsToYmd(parts);
}

function deriveBookingDate(
  event: ParsedEvent,
  bookingStartUtc: string,
  listingTimeZone: string,
): string {
  const parsed = parseIcsValue(event.dtStartRaw);
  if (!parsed) {
    return getDateInTimeZone(bookingStartUtc, listingTimeZone);
  }

  if (parsed.kind === "date") {
    return partsToYmd(parsed);
  }

  return getDateInTimeZone(bookingStartUtc, listingTimeZone);
}

function computeReadyByAtUtc(
  bookingDate: string,
  checkinTimeLocal: string,
  listingTimeZone: string,
): string {
  const [yearText, monthText, dayText] = bookingDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const checkin = normalizeCheckinTime(checkinTimeLocal);
  return zonedDateTimeToUtcIso(year, month, day, checkin.hour, checkin.minute, 0, listingTimeZone);
}

async function canManageOrg(service: any, userId: string, organizationId: string): Promise<boolean> {
  const { data: member } = await service
    .from("v1_organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return ["OWNER", "ORG_ADMIN", "MANAGER"].includes(member?.role || "");
}

async function invokeAutomations(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/run-automations-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-internal-service-key": serviceKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("sync-ics-v1 automation invoke failed", response.status, text);
    }
  } catch (error) {
    console.warn("sync-ics-v1 automation invoke error", error);
  }
}

async function invokeWebhooks(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-webhooks-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-internal-service-key": serviceKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("sync-ics-v1 webhook invoke failed", response.status, body);
    }
  } catch (error) {
    console.warn("sync-ics-v1 webhook invoke error", error);
  }
}

async function ensureCancellationDriftException(
  service: any,
  organizationId: string,
  eventId: string,
) {
  const { data: existing } = await service
    .from("v1_event_exceptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .eq("type", "CANCELLATION_DRIFT")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existing?.id) return;

  await service
    .from("v1_event_exceptions")
    .insert({
      organization_id: organizationId,
      event_id: eventId,
      type: "CANCELLATION_DRIFT",
      severity: "HIGH",
      status: "OPEN",
      notes: "Booking disappeared from iCal after grace window; event cancelled from drift detection.",
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const service = createClient(supabaseUrl, serviceKey);

    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim() || "";
    const internalHeader = req.headers.get("x-internal-service-key") || "";
    const internalCall = bearer === serviceKey || internalHeader === serviceKey;

    let requesterId: string | null = null;

    if (!internalCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      requesterId = userData.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = (body.organization_id as string | undefined) || null;
    const listingId = (body.listing_id as string | undefined) || null;
    const graceHours = Math.max(1, Number(body.grace_hours ?? 48));

    if (!internalCall && !organizationId) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!internalCall && organizationId && requesterId) {
      const ok = await canManageOrg(service, requesterId, organizationId);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let listingsQuery = service
      .from("v1_listings")
      .select("id, organization_id, ical_url, active, checkin_time_local, timezone")
      .eq("active", true)
      .not("ical_url", "is", null);

    if (organizationId) listingsQuery = listingsQuery.eq("organization_id", organizationId);
    if (listingId) listingsQuery = listingsQuery.eq("id", listingId);

    const { data: listings } = await listingsQuery;
    const rows = (listings || []) as ListingRow[];

    let bookingsUpserted = 0;
    let eventsUpserted = 0;
    let bookingsCancelled = 0;
    let driftExceptions = 0;

    for (const listing of rows) {
      if (!listing.ical_url) continue;

      const tzResolution = normalizeTimeZone(listing.timezone);
      const listingTimeZone = tzResolution.timeZone;
      if (tzResolution.fellBack) {
        console.warn("sync-ics-v1 invalid listing timezone, falling back to UTC", {
          listing_id: listing.id,
          configured_timezone: listing.timezone,
        });
      }

      let feed = "";
      try {
        const response = await fetch(listing.ical_url);
        if (!response.ok) continue;
        feed = await response.text();
      } catch {
        continue;
      }

      const parsedEvents = parseIcs(feed);
      const seenUids = new Set<string>();

      for (const parsed of parsedEvents) {
        seenUids.add(parsed.uid);

        const bookingStartAt = parseIcsInstantToUtc(parsed.dtStartRaw, parsed.dtStartTzid, listingTimeZone) || new Date().toISOString();
        const bookingEndAt = parseIcsInstantToUtc(parsed.dtEndRaw || parsed.dtStartRaw, parsed.dtEndTzid || parsed.dtStartTzid, listingTimeZone)
          || bookingStartAt;

        const bookingDate = deriveBookingDate(parsed, bookingStartAt, listingTimeZone);
        const readyByAt = computeReadyByAtUtc(bookingDate, listing.checkin_time_local, listingTimeZone);

        const bookingPayload = {
          organization_id: listing.organization_id,
          listing_id: listing.id,
          ical_uid: parsed.uid,
          start_at: bookingStartAt,
          end_at: bookingEndAt,
          status: parsed.status,
          last_seen_at: new Date().toISOString(),
        };

        const { data: booking, error: bookingError } = await service
          .from("v1_bookings")
          .upsert(bookingPayload, { onConflict: "organization_id,listing_id,ical_uid" })
          .select("id, status")
          .single();

        if (bookingError || !booking) continue;
        bookingsUpserted += 1;

        const { data: existingEvent } = await service
          .from("v1_events")
          .select("id, status, ready_by_override_at")
          .eq("booking_id", booking.id)
          .maybeSingle();

        const effectiveReadyBy = existingEvent?.ready_by_override_at || readyByAt;

        if (parsed.status === "CANCELLED") {
          if (existingEvent?.id) {
            const { data: cancelledEvents } = await service
              .from("v1_events")
              .update({
                status: "CANCELLED",
                start_at: bookingPayload.start_at,
                end_at: effectiveReadyBy,
              })
              .eq("id", existingEvent.id)
              .neq("status", "COMPLETED")
              .select("id");

            for (const event of cancelledEvents || []) {
              await invokeAutomations(supabaseUrl, serviceKey, {
                organization_id: listing.organization_id,
                trigger_type: "BOOKING_CANCELLED",
                event_id: event.id,
              });
              await invokeWebhooks(supabaseUrl, serviceKey, {
                organization_id: listing.organization_id,
                event_type: "EVENT_CANCELLED",
                payload: {
                  event_id: event.id,
                  booking_uid: parsed.uid,
                  reason: "ical_status_cancelled",
                },
              });
            }
          }

          bookingsCancelled += 1;
          continue;
        }

        const baseEventPayload = {
          organization_id: listing.organization_id,
          listing_id: listing.id,
          booking_id: booking.id,
          start_at: bookingPayload.start_at,
          end_at: effectiveReadyBy,
        };

        if (existingEvent) {
          const updatePayload: Record<string, unknown> = { ...baseEventPayload };
          if (existingEvent.status === "CANCELLED") {
            updatePayload.status = "TODO";
          }

          await service
            .from("v1_events")
            .update(updatePayload)
            .eq("id", existingEvent.id);
        } else {
          const { data: insertedEvent } = await service
            .from("v1_events")
            .insert({
              ...baseEventPayload,
              status: "TODO",
            })
            .select("id")
            .single();

          if (insertedEvent?.id) {
            await invokeAutomations(supabaseUrl, serviceKey, {
              organization_id: listing.organization_id,
              trigger_type: "EVENT_CREATED",
              event_id: insertedEvent.id,
            });
          }
        }

        eventsUpserted += 1;
      }

      const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000).toISOString();
      const { data: staleBookings } = await service
        .from("v1_bookings")
        .select("id, ical_uid")
        .eq("organization_id", listing.organization_id)
        .eq("listing_id", listing.id)
        .lt("last_seen_at", cutoff)
        .eq("status", "CONFIRMED");

      for (const stale of staleBookings || []) {
        if (seenUids.has(stale.ical_uid)) continue;

        await service
          .from("v1_bookings")
          .update({ status: "CANCELLED" })
          .eq("id", stale.id);

        const { data: cancelledEvents } = await service
          .from("v1_events")
          .update({ status: "CANCELLED" })
          .eq("booking_id", stale.id)
          .neq("status", "COMPLETED")
          .select("id");

        bookingsCancelled += 1;

        for (const event of cancelledEvents || []) {
          await ensureCancellationDriftException(service, listing.organization_id, event.id);
          driftExceptions += 1;

          await invokeAutomations(supabaseUrl, serviceKey, {
            organization_id: listing.organization_id,
            trigger_type: "BOOKING_CANCELLED",
            event_id: event.id,
          });
          await invokeWebhooks(supabaseUrl, serviceKey, {
            organization_id: listing.organization_id,
            event_type: "EVENT_CANCELLED",
            payload: {
              event_id: event.id,
              booking_uid: stale.ical_uid,
              reason: "ical_drift_cancelled",
            },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        listings_processed: rows.length,
        bookings_upserted: bookingsUpserted,
        events_upserted: eventsUpserted,
        bookings_cancelled: bookingsCancelled,
        cancellation_drift_exceptions: driftExceptions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("sync-ics-v1 error", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
