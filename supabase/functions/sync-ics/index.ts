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
      // Handle folded lines (lines starting with space/tab are continuations)
      const unfolded = block.replace(/\r?\n[ \t]/g, "");
      const regex = new RegExp(`^${name}[;:](.*)$`, "m");
      const match = unfolded.match(regex);
      if (!match) return "";
      // For fields with parameters like DTSTART;VALUE=DATE:20260215
      const val = match[1];
      const colonIdx = val.indexOf(":");
      // If the regex already consumed the colon via [;:], the value is match[1]
      // But if there are parameters, the actual value is after the last colon
      if (name === "DTSTART" || name === "DTEND") {
        // Could be DTSTART;VALUE=DATE:20260301 or DTSTART:20260301T150000Z
        const parts = match[0].split(":");
        return parts[parts.length - 1].trim();
      }
      return val.trim();
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
  // Formats: 20260215 or 20260215T150000Z or 20260215T150000
  if (!dateStr) return "";
  const clean = dateStr.replace(/[^0-9TZ]/g, "");

  if (clean.length === 8) {
    // Date only: YYYYMMDD
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }

  // DateTime: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { property_id } = await req.json();

    // Fetch property
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      throw new Error(`Property not found: ${propError?.message}`);
    }

    const icsUrls: { url: string; platform: string }[] = [];
    if (property.ics_url_airbnb) icsUrls.push({ url: property.ics_url_airbnb, platform: "airbnb" });
    if (property.ics_url_booking) icsUrls.push({ url: property.ics_url_booking, platform: "booking" });
    if (property.ics_url_other) icsUrls.push({ url: property.ics_url_other, platform: "other" });

    if (icsUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No ICS URLs configured for this property" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalBookings = 0;
    let totalTasks = 0;

    for (const { url, platform } of icsUrls) {
      // Fetch ICS file
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ICS from ${platform}: ${response.status}`);
        continue;
      }

      const icsText = await response.text();
      const events = parseICS(icsText);

      console.log(`Parsed ${events.length} events from ${platform} ICS`);

      for (const event of events) {
        const startDate = extractDateOnly(event.dtstart);
        const endDate = extractDateOnly(event.dtend);

        if (!startDate || !endDate) continue;

        // Skip blocked/unavailable events (Airbnb marks these)
        const summary = (event.summary || "").toLowerCase();
        if (summary.includes("not available") || summary.includes("blocked")) continue;

        // Calculate nights
        const start = new Date(startDate);
        const end = new Date(endDate);
        const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

        const externalUid = `${platform}:${event.uid}`;

        // Upsert booking by external_uid
        const { data: booking, error: bookingError } = await supabase
          .from("bookings")
          .upsert(
            {
              property_id: property.id,
              external_uid: externalUid,
              source_platform: platform,
              start_date: startDate,
              end_date: endDate,
              nights,
              checkin_at: `${startDate}T${property.default_checkin_time || "15:00:00"}`,
              checkout_at: `${endDate}T${property.default_checkout_time || "11:00:00"}`,
              raw_ics_payload: JSON.stringify(event),
            },
            { onConflict: "external_uid" }
          )
          .select()
          .single();

        if (bookingError) {
          console.error(`Booking upsert error: ${bookingError.message}`);
          continue;
        }

        totalBookings++;

        // Generate cleaning task based on cleaning_mode
        const cleaningMode = property.cleaning_mode || "CLEAN_ON_CHECKOUT";
        let taskDate: string;
        let taskStartAt: string;
        let taskEndAt: string;
        let previousBookingId: string | null = null;
        let nextBookingId: string | null = null;

        if (cleaningMode === "CLEAN_ON_CHECKOUT") {
          taskDate = endDate;
          taskStartAt = `${endDate}T${property.default_checkout_time || "11:00:00"}`;
          taskEndAt = `${endDate}T${property.default_checkin_time || "15:00:00"}`;
          previousBookingId = booking.id;
        } else {
          // CLEAN_ON_CHECKIN
          taskDate = startDate;
          taskStartAt = `${startDate}T08:00:00`;
          taskEndAt = `${startDate}T${property.default_checkin_time || "15:00:00"}`;
          nextBookingId = booking.id;
        }

        // Check if a non-locked task already exists for this booking
        const { data: existingTasks } = await supabase
          .from("cleaning_tasks")
          .select("id, locked")
          .eq("property_id", property.id)
          .or(
            `previous_booking_id.eq.${booking.id},next_booking_id.eq.${booking.id}`
          );

        const lockedExists = existingTasks?.some((t) => t.locked);

        if (!lockedExists && (!existingTasks || existingTasks.length === 0)) {
          // Create new cleaning task
          const { error: taskError } = await supabase
            .from("cleaning_tasks")
            .insert({
              property_id: property.id,
              source: "AUTO",
              status: "TODO",
              start_at: taskStartAt,
              end_at: taskEndAt,
              previous_booking_id: previousBookingId,
              next_booking_id: nextBookingId,
              nights_to_show: nights,
            });

          if (!taskError) totalTasks++;
          else console.error(`Task creation error: ${taskError.message}`);
        } else if (!lockedExists && existingTasks && existingTasks.length > 0) {
          // Update existing unlocked task
          await supabase
            .from("cleaning_tasks")
            .update({
              start_at: taskStartAt,
              end_at: taskEndAt,
              nights_to_show: nights,
            })
            .eq("id", existingTasks[0].id)
            .eq("locked", false);
        }
      }
    }

    // Update last_synced_at
    await supabase
      .from("properties")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", property.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        bookings_synced: totalBookings, 
        tasks_created: totalTasks 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
