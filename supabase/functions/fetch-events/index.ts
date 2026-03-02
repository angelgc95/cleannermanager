import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Built-in bank holidays dataset (major countries)
const BANK_HOLIDAYS: Record<string, { date: string; title: string }[]> = {
  ES: [
    { date: "01-01", title: "Año Nuevo" },
    { date: "01-06", title: "Día de Reyes" },
    { date: "05-01", title: "Día del Trabajo" },
    { date: "08-15", title: "Asunción de la Virgen" },
    { date: "10-12", title: "Fiesta Nacional de España" },
    { date: "11-01", title: "Todos los Santos" },
    { date: "12-06", title: "Día de la Constitución" },
    { date: "12-08", title: "Inmaculada Concepción" },
    { date: "12-25", title: "Navidad" },
  ],
  GB: [
    { date: "01-01", title: "New Year's Day" },
    { date: "12-25", title: "Christmas Day" },
    { date: "12-26", title: "Boxing Day" },
  ],
  US: [
    { date: "01-01", title: "New Year's Day" },
    { date: "07-04", title: "Independence Day" },
    { date: "12-25", title: "Christmas Day" },
  ],
  FR: [
    { date: "01-01", title: "Jour de l'An" },
    { date: "05-01", title: "Fête du Travail" },
    { date: "05-08", title: "Victoire 1945" },
    { date: "07-14", title: "Fête Nationale" },
    { date: "08-15", title: "Assomption" },
    { date: "11-01", title: "Toussaint" },
    { date: "11-11", title: "Armistice" },
    { date: "12-25", title: "Noël" },
  ],
  DE: [
    { date: "01-01", title: "Neujahrstag" },
    { date: "05-01", title: "Tag der Arbeit" },
    { date: "10-03", title: "Tag der Deutschen Einheit" },
    { date: "12-25", title: "Weihnachtstag" },
    { date: "12-26", title: "Zweiter Weihnachtstag" },
  ],
  IT: [
    { date: "01-01", title: "Capodanno" },
    { date: "01-06", title: "Epifania" },
    { date: "04-25", title: "Festa della Liberazione" },
    { date: "05-01", title: "Festa del Lavoro" },
    { date: "06-02", title: "Festa della Repubblica" },
    { date: "08-15", title: "Ferragosto" },
    { date: "11-01", title: "Tutti i Santi" },
    { date: "12-08", title: "Immacolata Concezione" },
    { date: "12-25", title: "Natale" },
    { date: "12-26", title: "Santo Stefano" },
  ],
  PT: [
    { date: "01-01", title: "Ano Novo" },
    { date: "04-25", title: "Dia da Liberdade" },
    { date: "05-01", title: "Dia do Trabalhador" },
    { date: "06-10", title: "Dia de Portugal" },
    { date: "08-15", title: "Assunção de Nossa Senhora" },
    { date: "10-05", title: "Implantação da República" },
    { date: "11-01", title: "Dia de Todos os Santos" },
    { date: "12-01", title: "Restauração da Independência" },
    { date: "12-08", title: "Imaculada Conceição" },
    { date: "12-25", title: "Natal" },
  ],
};

function generateHolidayEvents(
  countryCode: string,
  dateFrom: string,
  dateTo: string,
  locationKey: string
) {
  const holidays = BANK_HOLIDAYS[countryCode.toUpperCase()] || [];
  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  const events: any[] = [];

  for (
    let year = fromDate.getFullYear();
    year <= toDate.getFullYear();
    year++
  ) {
    for (const h of holidays) {
      const d = new Date(`${year}-${h.date}`);
      if (d >= fromDate && d <= toDate) {
        events.push({
          location_key: locationKey,
          date: d.toISOString().slice(0, 10),
          category: "bank_holiday",
          title: h.title,
          venue: null,
          start_time: null,
          popularity_score: 0.8,
          source: "builtin",
          raw: { country: countryCode },
        });
      }
    }
  }
  return events;
}

// Map Ticketmaster classification to our categories
function mapTMCategory(segment: string, genre: string): string {
  const s = (segment || "").toLowerCase();
  const g = (genre || "").toLowerCase();
  if (s === "music" || g.includes("music") || g.includes("concert")) return "music";
  if (s === "sports" || g.includes("football") || g.includes("soccer") || g.includes("basketball") || g.includes("tennis")) return "sports";
  if (s === "arts & theatre" || g.includes("festival") || g.includes("theatre")) return "festival";
  return "music"; // default
}

async function fetchTicketmasterEvents(
  city: string,
  countryCode: string,
  dateFrom: string,
  dateTo: string,
  locationKey: string
): Promise<any[]> {
  const apiKey = Deno.env.get("TICKETMASTER_API_KEY");
  if (!apiKey) {
    console.log("TICKETMASTER_API_KEY not configured, skipping.");
    return [];
  }

  try {
    const startDateTime = `${dateFrom}T00:00:00Z`;
    const endDateTime = `${dateTo}T23:59:59Z`;
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("city", city);
    url.searchParams.set("countryCode", countryCode);
    url.searchParams.set("startDateTime", startDateTime);
    url.searchParams.set("endDateTime", endDateTime);
    url.searchParams.set("size", "50");
    url.searchParams.set("sort", "date,asc");

    console.log(`Fetching Ticketmaster events for ${city}, ${countryCode}...`);
    const resp = await fetch(url.toString());
    if (!resp.ok) {
      console.error(`Ticketmaster API error: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const embedded = data?._embedded?.events || [];
    console.log(`Found ${embedded.length} Ticketmaster events`);

    return embedded.map((ev: any) => {
      const segment = ev.classifications?.[0]?.segment?.name || "";
      const genre = ev.classifications?.[0]?.genre?.name || "";
      const venue = ev._embedded?.venues?.[0]?.name || null;
      const localDate = ev.dates?.start?.localDate || dateFrom;

      return {
        location_key: locationKey,
        date: localDate,
        category: mapTMCategory(segment, genre),
        title: ev.name || "Event",
        venue,
        start_time: ev.dates?.start?.localTime ? `${localDate}T${ev.dates.start.localTime}` : null,
        popularity_score: Math.min((ev.popularity || 0.5), 1.0),
        source: "ticketmaster",
        raw: { id: ev.id, url: ev.url, segment, genre },
      };
    });
  } catch (err) {
    console.error("Ticketmaster fetch error:", err);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const { data: roleCheck } = await supabase.rpc("has_role", {
      _role: "host",
      _user_id: userId,
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Host only" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { location_key, country_code, date_from, date_to, city } =
      await req.json();

    if (!location_key || !date_from || !date_to) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Delete old non-manual events for this location+range to refresh
    await supabase
      .from("events_cache")
      .delete()
      .eq("location_key", location_key)
      .eq("host_user_id", userId)
      .neq("source", "manual")
      .gte("date", date_from)
      .lte("date", date_to);

    // Generate bank holiday events
    const holidayEvents = generateHolidayEvents(
      country_code || "ES",
      date_from,
      date_to,
      location_key
    );

    // Generate weekend boost events
    const weekendEvents: any[] = [];
    const from = new Date(date_from);
    const to = new Date(date_to);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 5 || dow === 6) {
        weekendEvents.push({
          location_key,
          date: d.toISOString().slice(0, 10),
          category: "weekend",
          title: dow === 5 ? "Friday" : "Saturday",
          venue: null,
          start_time: null,
          popularity_score: 0.3,
          source: "builtin",
          raw: null,
        });
      }
    }

    // Fetch Ticketmaster events
    const cityName = city || location_key.split("_")[0] || "";
    const tmEvents = await fetchTicketmasterEvents(
      cityName,
      country_code || "ES",
      date_from,
      date_to,
      location_key
    );

    const allEvents = [...holidayEvents, ...weekendEvents, ...tmEvents].map(
      (e) => ({ ...e, host_user_id: userId })
    );

    let eventsInserted = 0;
    if (allEvents.length > 0) {
      const { error: insertErr } = await supabase
        .from("events_cache")
        .insert(allEvents);
      if (insertErr) throw insertErr;
      eventsInserted = allEvents.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        events_inserted: eventsInserted,
        breakdown: {
          holidays: holidayEvents.length,
          weekends: weekendEvents.length,
          ticketmaster: tmEvents.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
