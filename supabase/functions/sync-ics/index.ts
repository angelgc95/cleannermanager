import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ICSEvent {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
  description: string;
}

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

async function syncListing(supabase: any, listing: any): Promise<{ bookings: number; events: number }> {
  const icsUrls: { url: string; platform: string }[] = [];
  if (listing.ics_url_airbnb) icsUrls.push({ url: listing.ics_url_airbnb, platform: "airbnb" });
  if (listing.ics_url_booking) icsUrls.push({ url: listing.ics_url_booking, platform: "booking" });
  if (listing.ics_url_other) icsUrls.push({ url: listing.ics_url_other, platform: "other" });

  if (icsUrls.length === 0) return { bookings: 0, events: 0 };

  let totalBookings = 0;
  let totalEvents = 0;

  // Get the default cleaner for this listing
  const { data: assignment } = await supabase
    .from("cleaner_assignments")
    .select("cleaner_user_id")
    .eq("listing_id", listing.id)
    .limit(1)
    .maybeSingle();
  const defaultCleanerId = assignment?.cleaner_user_id || null;

  // Get checklist template for this listing
  const templateId = listing.default_checklist_template_id || null;

  for (const { url, platform } of icsUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > 1_048_576) continue;

      const icsText = await response.text();
      if (icsText.length > 1_048_576) continue;

      const icsEvents = parseICS(icsText);

      for (const icsEvent of icsEvents) {
        const startDate = extractDateOnly(icsEvent.dtstart);
        const endDate = extractDateOnly(icsEvent.dtend);
        if (!startDate || !endDate) continue;

        const summary = (icsEvent.summary || "").toLowerCase();
        if (summary.includes("not available") || summary.includes("blocked")) continue;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

        const externalUid = `${platform}:${icsEvent.uid}`;

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
          .upsert({
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
          }, { onConflict: "external_uid" })
          .select()
          .single();

        if (bookingError) continue;
        totalBookings++;

        // Create cleaning_event on CHECK-IN day
        const eventStartAt = `${startDate}T${listing.default_checkout_time || "11:00:00"}`;
        const eventEndAt = `${startDate}T${listing.default_checkin_time || "15:00:00"}`;
        const reference = confirmationCode || icsEvent.uid || externalUid;

        const eventDetailsJson = {
          nights,
          guests: null,
          reference,
        };

        // Check for existing event (by listing_id + booking_id unique)
        const { data: existingEvent } = await supabase
          .from("cleaning_events")
          .select("id, locked, status")
          .eq("listing_id", listing.id)
          .eq("booking_id", booking.id)
          .maybeSingle();

        if (!existingEvent) {
          // Insert new cleaning event
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
          if (!eventError) totalEvents++;
        } else if (!existingEvent.locked && existingEvent.status !== "DONE" && existingEvent.status !== "CANCELLED") {
          // Update existing non-locked event
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
    } catch (err) {
      console.error(`Error syncing ${platform} for ${listing.name}:`, err);
    }
  }

  await supabase
    .from("listings")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", listing.id);

  return { bookings: totalBookings, events: totalEvents };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: isHost } = await supabase.rpc("has_role", { _user_id: user.id, _role: "host" });
    if (!isHost) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* batch mode */ }

    const listing_id = body.listing_id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (listing_id && !uuidRegex.test(listing_id)) {
      return new Response(JSON.stringify({ error: "Invalid listing_id format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listing_id) {
      const { data: listing, error: listErr } = await supabase
        .from("listings").select("*").eq("id", listing_id).eq("host_user_id", user.id).single();
      if (listErr || !listing) throw new Error("Listing not found");
      const result = await syncListing(supabase, listing);
      return new Response(
        JSON.stringify({ success: true, bookings_synced: result.bookings, events_created: result.events }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const { data: listings } = await supabase
        .from("listings").select("*").eq("host_user_id", user.id).eq("sync_enabled", true).limit(50);
      let totalBookings = 0, totalEvents = 0, listingsSynced = 0;
      for (const listing of (listings || [])) {
        const result = await syncListing(supabase, listing);
        totalBookings += result.bookings;
        totalEvents += result.events;
        listingsSynced++;
      }
      return new Response(
        JSON.stringify({ success: true, listings_synced: listingsSynced, bookings_synced: totalBookings, events_created: totalEvents }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
