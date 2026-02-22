import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { listing_id } = await req.json();
    if (!listing_id) {
      return new Response(
        JSON.stringify({ error: "listing_id required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get listing
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listing_id)
      .eq("host_user_id", userId)
      .single();

    if (listingErr || !listing) {
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Get host settings
    const { data: settings } = await supabase
      .from("host_settings")
      .select("*")
      .eq("host_user_id", userId)
      .single();

    if (!settings) {
      return new Response(
        JSON.stringify({ error: "Host settings not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const basePrice = listing.base_nightly_price || 100;
    const daysAhead = settings.suggestion_days_ahead || 90;
    const minUplift = settings.min_uplift_pct || 0;
    const maxUplift = settings.max_uplift_pct || 30;
    const weights = (settings.weights_json as Record<string, number>) || {
      music: 1.5,
      festival: 2.0,
      sports: 1.0,
      bank_holiday: 1.2,
      weekend: 0.5,
    };

    const locationKey = `${(listing.city || "unknown").toLowerCase()}_${(listing.country_code || "XX").toLowerCase()}`;

    const today = new Date();
    const dateFrom = today.toISOString().slice(0, 10);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysAhead);
    const dateTo = endDate.toISOString().slice(0, 10);

    // First fetch events for this location
    await supabase.functions.invoke("fetch-events", {
      body: {
        location_key: locationKey,
        country_code: listing.country_code || "ES",
        date_from: dateFrom,
        date_to: dateTo,
      },
    });

    // Get cached events
    const { data: events } = await supabase
      .from("events_cache")
      .select("*")
      .eq("location_key", locationKey)
      .gte("date", dateFrom)
      .lte("date", dateTo);

    // Group events by date
    const eventsByDate: Record<string, any[]> = {};
    (events || []).forEach((e: any) => {
      if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
      eventsByDate[e.date].push(e);
    });

    // Compute suggestions for each day
    const suggestions: any[] = [];
    for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dayEvents = eventsByDate[dateStr] || [];

      let demandScore = 0;
      const reasons: any[] = [];

      for (const ev of dayEvents) {
        const catWeight = weights[ev.category] || 0.5;
        const popScore = ev.popularity_score || 0.5;
        const contribution = catWeight * popScore;
        demandScore += contribution;
        reasons.push({
          category: ev.category,
          title: ev.title,
          venue: ev.venue,
          contribution: Math.round(contribution * 100) / 100,
        });
      }

      // Only create suggestions when there are actual demand signals
      if (dayEvents.length === 0 || demandScore === 0) continue;

      // Normalize: a demand_score of 2.0 → maxUplift
      const normalizedScore = Math.min(demandScore / 2.0, 1.0);
      let upliftPct =
        minUplift + normalizedScore * (maxUplift - minUplift);
      upliftPct = Math.round(upliftPct * 10) / 10;

      // Confidence based on number of signals
      const confidence = Math.min(dayEvents.length / 3, 1.0);

      const suggestedPrice =
        Math.round(basePrice * (1 + upliftPct / 100) * 100) / 100;

      let colorLevel = "green";
      if (upliftPct >= 20) colorLevel = "red";
      else if (upliftPct >= 10) colorLevel = "orange";
      else if (upliftPct < 1) colorLevel = "none";

      if (upliftPct > 0) {
        suggestions.push({
          host_user_id: userId,
          listing_id,
          date: dateStr,
          base_price: basePrice,
          suggested_price: suggestedPrice,
          uplift_pct: upliftPct,
          confidence: Math.round(confidence * 100) / 100,
          color_level: colorLevel,
          reasons,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Upsert suggestions
    if (suggestions.length > 0) {
      const { error: upsertErr } = await supabase
        .from("pricing_suggestions")
        .upsert(suggestions, { onConflict: "listing_id,date" });
      if (upsertErr) throw upsertErr;
    }

    // Update last_refreshed_at
    await supabase
      .from("host_settings")
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq("host_user_id", userId);

    return new Response(
      JSON.stringify({
        ok: true,
        suggestions_count: suggestions.length,
        date_range: { from: dateFrom, to: dateTo },
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
