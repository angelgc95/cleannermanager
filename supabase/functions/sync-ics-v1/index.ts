import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ParsedEvent = {
  uid: string;
  startAt: string;
  endAt: string;
  status: "CONFIRMED" | "CANCELLED";
};

function unfoldIcs(input: string): string {
  return input.replace(/\r?\n[ \t]/g, "");
}

function parseDate(value: string): string {
  const clean = value.trim().replace(/[^0-9TZ]/g, "");
  if (clean.length >= 15) {
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    const hour = clean.slice(9, 11) || "00";
    const minute = clean.slice(11, 13) || "00";
    const second = clean.slice(13, 15) || "00";
    const suffix = clean.endsWith("Z") ? "Z" : "";
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${suffix}`;
  }
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`;
  }
  return "";
}

function parseIcs(ics: string): ParsedEvent[] {
  const text = unfoldIcs(ics);
  const chunks = text.split("BEGIN:VEVENT").slice(1);
  const parsed: ParsedEvent[] = [];

  for (const chunk of chunks) {
    const block = chunk.split("END:VEVENT")[0] || "";
    const uid = block.match(/^UID[:;](.*)$/m)?.[1]?.trim() || "";
    const dtStartRaw = block.match(/^DTSTART(?:[^:]*)?:(.*)$/m)?.[1]?.trim() || "";
    const dtEndRaw = block.match(/^DTEND(?:[^:]*)?:(.*)$/m)?.[1]?.trim() || "";
    const statusRaw = (block.match(/^STATUS[:;](.*)$/m)?.[1]?.trim() || "CONFIRMED").toUpperCase();

    if (!uid) continue;

    const startAt = parseDate(dtStartRaw);
    const endAt = parseDate(dtEndRaw || dtStartRaw);

    parsed.push({
      uid,
      startAt,
      endAt,
      status: statusRaw === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    });
  }

  return parsed;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = (body.organization_id as string | undefined) || null;
    const listingId = (body.listing_id as string | undefined) || null;
    const graceHours = Number(body.grace_hours ?? 48);

    if (organizationId) {
      const ok = await canManageOrg(service, userData.user.id, organizationId);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let listingsQuery = service
      .from("v1_listings")
      .select("id, organization_id, ical_url, active")
      .eq("active", true)
      .not("ical_url", "is", null);

    if (organizationId) listingsQuery = listingsQuery.eq("organization_id", organizationId);
    if (listingId) listingsQuery = listingsQuery.eq("id", listingId);

    const { data: listings } = await listingsQuery;
    const rows = listings || [];

    let bookingsUpserted = 0;
    let eventsUpserted = 0;

    for (const listing of rows) {
      if (!listing.ical_url) continue;
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

      for (const event of parsedEvents) {
        seenUids.add(event.uid);
        const bookingPayload = {
          organization_id: listing.organization_id,
          listing_id: listing.id,
          ical_uid: event.uid,
          start_at: event.startAt || new Date().toISOString(),
          end_at: event.endAt || event.startAt || new Date().toISOString(),
          status: event.status,
          last_seen_at: new Date().toISOString(),
        };

        const { data: booking, error: bookingError } = await service
          .from("v1_bookings")
          .upsert(bookingPayload, { onConflict: "organization_id,listing_id,ical_uid" })
          .select("id, status")
          .single();

        if (bookingError || !booking) continue;
        bookingsUpserted += 1;

        if (event.status === "CANCELLED") {
          await service
            .from("v1_events")
            .update({ status: "CANCELLED" })
            .eq("booking_id", booking.id)
            .neq("status", "COMPLETED");
          continue;
        }

        const { data: existingEvent } = await service
          .from("v1_events")
          .select("id")
          .eq("booking_id", booking.id)
          .maybeSingle();

        const eventPayload = {
          organization_id: listing.organization_id,
          listing_id: listing.id,
          booking_id: booking.id,
          start_at: bookingPayload.start_at,
          end_at: bookingPayload.end_at,
          status: "TODO",
        };

        if (existingEvent) {
          await service.from("v1_events").update(eventPayload).eq("id", existingEvent.id);
        } else {
          await service.from("v1_events").insert(eventPayload);
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
        await service
          .from("v1_events")
          .update({ status: "CANCELLED" })
          .eq("booking_id", stale.id)
          .neq("status", "COMPLETED");
      }
    }

    return new Response(
      JSON.stringify({
        listings_processed: rows.length,
        bookings_upserted: bookingsUpserted,
        events_upserted: eventsUpserted,
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
