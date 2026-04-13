import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cron-secret",
};

const DEFAULT_DRIFT_GRACE_HOURS = 24;

interface ICSEvent {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
  description: string;
  status: "CONFIRMED" | "CANCELLED";
}

interface SyncListingOptions {
  graceHours: number;
}

interface SyncListingResult {
  bookings: number;
  eventsCreated: number;
  eventsRemoved: number;
  bookingsRemoved: number;
}

type CleaningEventStartMode = "CURRENT_BOOKING_CHECKOUT" | "UPCOMING_BOOKING_CHECKIN";

function parseICS(icsText: string): ICSEvent[] {
  const events: ICSEvent[] = [];
  const blocks = icsText.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const event: Partial<ICSEvent> = {};

    const getField = (name: string): string => {
      const unfolded = block.replace(/\r?\n[ \t]/g, "");
      const regex = new RegExp(`^${name}[;:](.*)$`, "m");
      const match = unfolded.match(regex);
      if (!match) return "";
      if (name === "DTSTART" || name === "DTEND") {
        const parts = match[0].split(":");
        return parts[parts.length - 1].trim();
      }
      return match[1].trim();
    };

    event.uid = getField("UID");
    event.summary = getField("SUMMARY");
    event.dtstart = getField("DTSTART");
    event.dtend = getField("DTEND");
    event.description = getField("DESCRIPTION");

    const rawStatus = getField("STATUS").toUpperCase();
    event.status = rawStatus === "CANCELLED" ? "CANCELLED" : "CONFIRMED";

    if (event.uid && event.dtstart && event.dtend) {
      events.push(event as ICSEvent);
    }
  }
  return events;
}

function parseICSDate(dateStr: string): string {
  if (!dateStr) return "";
  const clean = dateStr.replace(/[^0-9TZ]/g, "");
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  const year = clean.slice(0, 4);
  const month = clean.slice(4, 6);
  const day = clean.slice(6, 8);
  const hour = clean.slice(9, 11) || "00";
  const min = clean.slice(11, 13) || "00";
  const sec = clean.slice(13, 15) || "00";
  const tz = dateStr.endsWith("Z") ? "Z" : "";
  return `${year}-${month}-${day}T${hour}:${min}:${sec}${tz}`;
}

function extractDateOnly(dateStr: string): string {
  return parseICSDate(dateStr).slice(0, 10);
}

function normalizeGraceHours(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DRIFT_GRACE_HOURS;
  return Math.max(0, parsed);
}

async function removeAutoBookingArtifacts(
  supabase: any,
  booking: { id: string; listing_id: string }
): Promise<{ eventRemoved: number; bookingRemoved: number }> {
  const { data: existingEvent } = await supabase
    .from("cleaning_events")
    .select("id, status, locked, checklist_run_id, source")
    .eq("listing_id", booking.listing_id)
    .eq("booking_id", booking.id)
    .maybeSingle();

  const canRemoveEvent =
    !existingEvent ||
    (existingEvent.source === "AUTO" &&
      existingEvent.status === "TODO" &&
      !existingEvent.locked &&
      !existingEvent.checklist_run_id);

  if (!canRemoveEvent) {
    return { eventRemoved: 0, bookingRemoved: 0 };
  }

  let eventRemoved = 0;
  if (existingEvent?.id) {
    const { error } = await supabase
      .from("cleaning_events")
      .delete()
      .eq("id", existingEvent.id);

    if (error) throw error;
    eventRemoved = 1;
  }

  const { error: bookingError } = await supabase
    .from("bookings")
    .delete()
    .eq("id", booking.id);

  if (bookingError) throw bookingError;

  return { eventRemoved, bookingRemoved: 1 };
}

async function syncListing(
  supabase: any,
  listing: any,
  options: SyncListingOptions
): Promise<SyncListingResult> {
  const icsUrls: { url: string; platform: string }[] = [];
  if (listing.ics_url_airbnb) icsUrls.push({ url: listing.ics_url_airbnb, platform: "airbnb" });
  if (listing.ics_url_booking) icsUrls.push({ url: listing.ics_url_booking, platform: "booking" });
  if (listing.ics_url_other) icsUrls.push({ url: listing.ics_url_other, platform: "other" });

  if (icsUrls.length === 0) {
    return { bookings: 0, eventsCreated: 0, eventsRemoved: 0, bookingsRemoved: 0 };
  }

  let totalBookings = 0;
  let totalEventsCreated = 0;
  let totalEventsRemoved = 0;
  let totalBookingsRemoved = 0;

  const { data: assignment } = await supabase
    .from("cleaner_assignments")
    .select("cleaner_user_id")
    .eq("listing_id", listing.id)
    .limit(1)
    .maybeSingle();
  const defaultCleanerId = assignment?.cleaner_user_id || null;

  const templateId = listing.default_checklist_template_id || null;

  const { data: hostSettings } = await supabase
    .from("host_settings")
    .select("cleaning_event_start_mode")
    .eq("host_user_id", listing.host_user_id)
    .maybeSingle();

  const cleaningEventStartMode: CleaningEventStartMode =
    hostSettings?.cleaning_event_start_mode === "CURRENT_BOOKING_CHECKOUT"
      ? "CURRENT_BOOKING_CHECKOUT"
      : "UPCOMING_BOOKING_CHECKIN";

  for (const { url, platform } of icsUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 1_048_576) continue;

      const icsText = await response.text();
      if (icsText.length > 1_048_576) continue;

      const icsEvents = parseICS(icsText);
      const seenActiveUids = new Set<string>();
      const seenAt = new Date().toISOString();

      for (const icsEvent of icsEvents) {
        const summary = (icsEvent.summary || "").toLowerCase();
        if (summary.includes("not available") || summary.includes("blocked")) continue;

        const externalUid = `${platform}:${icsEvent.uid}`;

        if (icsEvent.status === "CANCELLED") {
          const { data: cancelledBooking } = await supabase
            .from("bookings")
            .select("id, listing_id")
            .eq("listing_id", listing.id)
            .eq("external_uid", externalUid)
            .maybeSingle();

          if (cancelledBooking) {
            const result = await removeAutoBookingArtifacts(supabase, cancelledBooking);
            totalEventsRemoved += result.eventRemoved;
            totalBookingsRemoved += result.bookingRemoved;
          }
          continue;
        }

        const startDate = extractDateOnly(icsEvent.dtstart);
        const endDate = extractDateOnly(icsEvent.dtend);
        if (!startDate || !endDate) continue;

        seenActiveUids.add(externalUid);

        const start = new Date(startDate);
        const end = new Date(endDate);
        const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

        let confirmationCode = "";
        if (icsEvent.description) {
          const desc = icsEvent.description.replace(/\\n/g, "\n");
          const urlMatch = desc.match(/airbnb\.com\/hosting\/reservations\/details\/([A-Za-z0-9]+)/);
          if (urlMatch) {
            confirmationCode = urlMatch[1];
          }
        }

        const { data: booking, error: bookingError } = await supabase
          .from("bookings")
          .upsert(
            {
              listing_id: listing.id,
              host_user_id: listing.host_user_id,
              external_uid: externalUid,
              source_platform: platform,
              start_date: startDate,
              end_date: endDate,
              nights,
              checkin_at: `${startDate}T${listing.default_checkin_time || "15:00:00"}`,
              checkout_at: `${endDate}T${listing.default_checkout_time || "11:00:00"}`,
              raw_ics_payload: JSON.stringify(icsEvent),
              last_seen_at: seenAt,
            },
            { onConflict: "external_uid" }
          )
          .select()
          .single();

        if (bookingError || !booking) continue;
        totalBookings++;

        const eventAnchorDate =
          cleaningEventStartMode === "CURRENT_BOOKING_CHECKOUT" ? endDate : startDate;
        const eventStartAt = `${eventAnchorDate}T${listing.default_checkout_time || "11:00:00"}`;
        const eventEndAt = `${eventAnchorDate}T${listing.default_checkin_time || "15:00:00"}`;
        const reference = confirmationCode || icsEvent.uid || externalUid;

        const eventDetailsJson = {
          nights,
          guests: null,
          reference,
          schedule_anchor: cleaningEventStartMode,
          source_date: eventAnchorDate,
        };

        const { data: existingEvent } = await supabase
          .from("cleaning_events")
          .select("id, locked, status")
          .eq("listing_id", listing.id)
          .eq("booking_id", booking.id)
          .maybeSingle();

        if (!existingEvent) {
          const { error: eventError } = await supabase
            .from("cleaning_events")
            .insert({
              listing_id: listing.id,
              host_user_id: listing.host_user_id,
              booking_id: booking.id,
              source: "AUTO",
              status: "TODO",
              start_at: eventStartAt,
              end_at: eventEndAt,
              assigned_cleaner_id: defaultCleanerId,
              checklist_template_id: templateId,
              event_details_json: eventDetailsJson,
              reference,
            });

          if (!eventError) totalEventsCreated++;
        } else if (
          !existingEvent.locked &&
          existingEvent.status !== "DONE" &&
          existingEvent.status !== "CANCELLED"
        ) {
          await supabase
            .from("cleaning_events")
            .update({
              start_at: eventStartAt,
              end_at: eventEndAt,
              event_details_json: eventDetailsJson,
              reference,
              checklist_template_id: templateId,
            })
            .eq("id", existingEvent.id);
        }
      }

      const cutoff = new Date(Date.now() - options.graceHours * 60 * 60 * 1000).toISOString();

      const { data: staleBookings } = await supabase
        .from("bookings")
        .select("id, listing_id, external_uid")
        .eq("listing_id", listing.id)
        .eq("source_platform", platform)
        .not("external_uid", "is", null)
        .lte("last_seen_at", cutoff);

      for (const staleBooking of staleBookings || []) {
        if (!staleBooking.external_uid || seenActiveUids.has(staleBooking.external_uid)) continue;

        const result = await removeAutoBookingArtifacts(supabase, staleBooking);
        totalEventsRemoved += result.eventRemoved;
        totalBookingsRemoved += result.bookingRemoved;
      }
    } catch (err) {
      console.error(`Error syncing ${platform} for ${listing.name}:`, err);
    }
  }

  await supabase
    .from("listings")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", listing.id);

  return {
    bookings: totalBookings,
    eventsCreated: totalEventsCreated,
    eventsRemoved: totalEventsRemoved,
    bookingsRemoved: totalBookingsRemoved,
  };
}

async function resetPendingAutoEventsForListing(supabase: any, listingId: string, hostUserId: string) {
  const { data, error } = await supabase
    .from("cleaning_events")
    .delete()
    .eq("listing_id", listingId)
    .eq("host_user_id", hostUserId)
    .eq("source", "AUTO")
    .eq("status", "TODO")
    .eq("locked", false)
    .is("checklist_run_id", null)
    .select("id");

  if (error) throw error;
  return (data || []).length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedCronSecret = req.headers.get("x-cron-secret");

    const supabase = createClient(supabaseUrl, serviceKey);

    let actingHostId: string | null = null;
    let cronAuthorized = false;

    if (cronSecret && providedCronSecret === cronSecret) {
      cronAuthorized = true;
    } else {
      const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
      if (!isHost) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      actingHostId = user.id;
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const listingId = body.listing_id;
    const resetExistingEvents = body.reset_existing_events === true;
    const graceHours = normalizeGraceHours(body.grace_hours);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (listingId && !uuidRegex.test(listingId)) {
      return new Response(JSON.stringify({ error: "Invalid listing_id format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listingId) {
      let query = supabase.from("listings").select("*").eq("id", listingId);
      if (!cronAuthorized && actingHostId) {
        query = query.eq("host_user_id", actingHostId);
      }

      const { data: listing, error: listErr } = await query.single();
      if (listErr || !listing) throw new Error("Listing not found");

      let eventsReset = 0;
      if (resetExistingEvents) {
        eventsReset = await resetPendingAutoEventsForListing(supabase, listing.id, listing.host_user_id);
      }

      const result = await syncListing(supabase, listing, { graceHours });

      return new Response(
        JSON.stringify({
          success: true,
          bookings_synced: result.bookings,
          events_created: result.eventsCreated,
          events_removed: result.eventsRemoved,
          bookings_removed: result.bookingsRemoved,
          events_reset: eventsReset,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let listingsQuery = supabase.from("listings").select("*").eq("sync_enabled", true).limit(250);
    if (!cronAuthorized && actingHostId) {
      listingsQuery = listingsQuery.eq("host_user_id", actingHostId);
    }

    const { data: listings } = await listingsQuery;

    let totalBookings = 0;
    let totalEventsCreated = 0;
    let totalEventsRemoved = 0;
    let totalBookingsRemoved = 0;
    let totalEventsReset = 0;
    let listingsSynced = 0;

    for (const listing of listings || []) {
      if (resetExistingEvents) {
        totalEventsReset += await resetPendingAutoEventsForListing(
          supabase,
          listing.id,
          listing.host_user_id
        );
      }

      const result = await syncListing(supabase, listing, { graceHours });
      totalBookings += result.bookings;
      totalEventsCreated += result.eventsCreated;
      totalEventsRemoved += result.eventsRemoved;
      totalBookingsRemoved += result.bookingsRemoved;
      listingsSynced++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        listings_synced: listingsSynced,
        bookings_synced: totalBookings,
        events_created: totalEventsCreated,
        events_removed: totalEventsRemoved,
        bookings_removed: totalBookingsRemoved,
        events_reset: totalEventsReset,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-ics error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred during sync" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
