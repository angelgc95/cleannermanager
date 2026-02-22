import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  // Generate for each year in range
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

    // Verify host role
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

    const { location_key, country_code, date_from, date_to } =
      await req.json();

    if (!location_key || !date_from || !date_to) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Check cache - if we already have events for this location+range, skip
    const { data: existing } = await supabase
      .from("events_cache")
      .select("id")
      .eq("location_key", location_key)
      .gte("date", date_from)
      .lte("date", date_to)
      .limit(1);

    let eventsInserted = 0;

    if (!existing || existing.length === 0) {
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

      const allEvents = [...holidayEvents, ...weekendEvents].map((e) => ({
        ...e,
        host_user_id: userId,
      }));

      if (allEvents.length > 0) {
        const { error: insertErr } = await supabase
          .from("events_cache")
          .insert(allEvents);
        if (insertErr) throw insertErr;
        eventsInserted = allEvents.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        events_inserted: eventsInserted,
        cached: existing && existing.length > 0,
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
