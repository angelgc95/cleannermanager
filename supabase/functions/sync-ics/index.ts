import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

async function syncListing(supabase: any, listing: any): Promise<{ bookings: number; tasks: number }> {
  const icsUrls: { url: string; platform: string }[] = [];
  if (listing.ics_url_airbnb) icsUrls.push({ url: listing.ics_url_airbnb, platform: "airbnb" });
  if (listing.ics_url_booking) icsUrls.push({ url: listing.ics_url_booking, platform: "booking" });
  if (listing.ics_url_other) icsUrls.push({ url: listing.ics_url_other, platform: "other" });

  if (icsUrls.length === 0) return { bookings: 0, tasks: 0 };

  let totalBookings = 0;
  let totalTasks = 0;

  for (const { url, platform } of icsUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > 1_048_576) continue;

      const icsText = await response.text();
      if (icsText.length > 1_048_576) continue;

      const events = parseICS(icsText);

      for (const event of events) {
        const startDate = extractDateOnly(event.dtstart);
        const endDate = extractDateOnly(event.dtend);
        if (!startDate || !endDate) continue;

        const summary = (event.summary || "").toLowerCase();
        if (summary.includes("not available") || summary.includes("blocked")) continue;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

        const externalUid = `${platform}:${event.uid}`;

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
            raw_ics_payload: JSON.stringify(event),
          }, { onConflict: "external_uid" })
          .select()
          .single();

        if (bookingError) continue;
        totalBookings++;

        // Create cleaning task on CHECK-IN day: from checkout time to checkin time
        const taskStartAt = `${startDate}T${listing.default_checkout_time || "11:00:00"}`;
        const taskEndAt = `${startDate}T${listing.default_checkin_time || "15:00:00"}`;

        const { data: existingTasks } = await supabase
          .from("cleaning_tasks")
          .select("id, locked")
          .eq("listing_id", listing.id)
          .or(`previous_booking_id.eq.${booking.id},next_booking_id.eq.${booking.id}`);

        const lockedExists = existingTasks?.some((t: any) => t.locked);

        if (!lockedExists && (!existingTasks || existingTasks.length === 0)) {
          // Use the booking's external UID as reference (e.g. reservation/confirmation code)
          const reference = event.uid || externalUid;

          const { error: taskError } = await supabase
            .from("cleaning_tasks")
            .insert({
              listing_id: listing.id,
              host_user_id: listing.host_user_id,
              source: "AUTO",
              status: "TODO",
              start_at: taskStartAt,
              end_at: taskEndAt,
              previous_booking_id: booking.id,
              nights_to_show: nights,
              reference,
            });
          if (!taskError) totalTasks++;
        } else if (!lockedExists && existingTasks && existingTasks.length > 0) {
          await supabase
            .from("cleaning_tasks")
            .update({ start_at: taskStartAt, end_at: taskEndAt, nights_to_show: nights })
            .eq("id", existingTasks[0].id)
            .eq("locked", false);
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

  return { bookings: totalBookings, tasks: totalTasks };
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

    // Verify host role
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
        JSON.stringify({ success: true, bookings_synced: result.bookings, tasks_created: result.tasks }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const { data: listings } = await supabase
        .from("listings").select("*").eq("host_user_id", user.id).eq("sync_enabled", true).limit(50);
      let totalBookings = 0, totalTasks = 0, listingsSynced = 0;
      for (const listing of (listings || [])) {
        const result = await syncListing(supabase, listing);
        totalBookings += result.bookings;
        totalTasks += result.tasks;
        listingsSynced++;
      }
      return new Response(
        JSON.stringify({ success: true, listings_synced: listingsSynced, bookings_synced: totalBookings, tasks_created: totalTasks }),
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
