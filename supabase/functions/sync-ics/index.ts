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
      const val = match[1];
      if (name === "DTSTART" || name === "DTEND") {
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

async function syncProperty(supabase: any, property: any): Promise<{ bookings: number; tasks: number }> {
  const icsUrls: { url: string; platform: string }[] = [];
  if (property.ics_url_airbnb) icsUrls.push({ url: property.ics_url_airbnb, platform: "airbnb" });
  if (property.ics_url_booking) icsUrls.push({ url: property.ics_url_booking, platform: "booking" });
  if (property.ics_url_other) icsUrls.push({ url: property.ics_url_other, platform: "other" });

  if (icsUrls.length === 0) return { bookings: 0, tasks: 0 };

  let totalBookings = 0;
  let totalTasks = 0;

  for (const { url, platform } of icsUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ICS from ${platform}: ${response.status}`);
        continue;
      }

      const icsText = await response.text();
      const events = parseICS(icsText);

      console.log(`Parsed ${events.length} events from ${platform} ICS for ${property.name}`);

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
          .upsert(
            {
              property_id: property.id,
              org_id: property.org_id,
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

        const cleaningMode = property.cleaning_mode || "CLEAN_ON_CHECKOUT";
        let taskStartAt: string;
        let taskEndAt: string;
        let previousBookingId: string | null = null;
        let nextBookingId: string | null = null;

        if (cleaningMode === "CLEAN_ON_CHECKOUT") {
          taskStartAt = `${endDate}T${property.default_checkout_time || "11:00:00"}`;
          taskEndAt = `${endDate}T${property.default_checkin_time || "15:00:00"}`;
          previousBookingId = booking.id;
        } else {
          taskStartAt = `${startDate}T08:00:00`;
          taskEndAt = `${startDate}T${property.default_checkin_time || "15:00:00"}`;
          nextBookingId = booking.id;
        }

        const { data: existingTasks } = await supabase
          .from("cleaning_tasks")
          .select("id, locked")
          .eq("property_id", property.id)
          .or(`previous_booking_id.eq.${booking.id},next_booking_id.eq.${booking.id}`);

        const lockedExists = existingTasks?.some((t: any) => t.locked);

        if (!lockedExists && (!existingTasks || existingTasks.length === 0)) {
          const { error: taskError } = await supabase
            .from("cleaning_tasks")
            .insert({
              property_id: property.id,
              org_id: property.org_id,
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
    } catch (err) {
      console.error(`Error syncing ${platform} for ${property.name}:`, err);
    }
  }

  // Update last_synced_at
  await supabase
    .from("properties")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", property.id);

  return { bookings: totalBookings, tasks: totalTasks };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body = batch mode
    }

    const { property_id } = body;

    if (property_id) {
      // Single property sync
      const { data: property, error: propError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", property_id)
        .single();

      if (propError || !property) {
        throw new Error(`Property not found: ${propError?.message}`);
      }

      const result = await syncProperty(supabase, property);

      return new Response(
        JSON.stringify({ success: true, bookings_synced: result.bookings, tasks_created: result.tasks }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Batch mode: sync all sync_enabled properties
      const { data: properties, error: propError } = await supabase
        .from("properties")
        .select("*")
        .eq("sync_enabled", true)
        .limit(50);

      if (propError) throw new Error(propError.message);

      let totalBookings = 0;
      let totalTasks = 0;
      let propertiesSynced = 0;

      for (const property of (properties || [])) {
        const result = await syncProperty(supabase, property);
        totalBookings += result.bookings;
        totalTasks += result.tasks;
        propertiesSynced++;
      }

      return new Response(
        JSON.stringify({
          success: true,
          properties_synced: propertiesSynced,
          bookings_synced: totalBookings,
          tasks_created: totalTasks,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
