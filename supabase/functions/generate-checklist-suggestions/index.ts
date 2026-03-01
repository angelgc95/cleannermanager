import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { description, mode, section_title } = body;

    // mode: "template" (default) generates full sections, "section" generates items for a single section
    const currentMode = mode || "template";

    if (!description || typeof description !== "string" || description.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Description too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt: string;

    if (currentMode === "section") {
      systemPrompt = `You are a cleaning checklist expert for short-term rental properties (Airbnb, Booking.com, etc).
Given a section title and a description of what this section should cover, generate practical checklist items for that section.

Rules:
- Generate 3-8 items appropriate for the described section
- Item types: YESNO (yes/no check), PHOTO (photo required), TEXT (free text), NUMBER (numeric value)
- Most items should be YESNO type
- Include at least one PHOTO item for verification
- Mark critical items as required=true
- Add helpful help_text for items that need clarification

Respond with ONLY valid JSON in this exact format:
{
  "items": [
    { "label": "Item description", "type": "YESNO", "required": true, "help_text": null },
    { "label": "Photo of area", "type": "PHOTO", "required": false, "help_text": "Take a clear photo" }
  ]
}`;
    } else {
      systemPrompt = `You are a cleaning checklist expert for short-term rental properties (Airbnb, Booking.com, etc).
Given a description of a property, generate a practical cleaning checklist organized into sections.

Rules:
- Create 4-7 sections appropriate for the property described
- Each section should have 3-7 items
- Item types: YESNO (yes/no check), PHOTO (photo required), TEXT (free text), NUMBER (numeric value)
- Most items should be YESNO type
- Include at least one PHOTO item per section for verification
- Mark critical items as required=true
- Add helpful help_text for items that need clarification
- Tailor sections to the specific property (e.g. skip "Garden" for an apartment, add "Pool" if mentioned)
- Always include an arrival/check-in section and a final checks section

Respond with ONLY valid JSON in this exact format:
{
  "sections": [
    {
      "title": "Section Name",
      "items": [
        { "label": "Item description", "type": "YESNO", "required": true, "help_text": null },
        { "label": "Photo of area", "type": "PHOTO", "required": false, "help_text": "Take a clear photo" }
      ]
    }
  ]
}`;
    }

    const userContent = currentMode === "section"
      ? `Section title: "${section_title || "Untitled"}"\nDescription: "${description.trim()}"`
      : `Property description: "${description.trim()}"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from possible markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    const parsed = JSON.parse(jsonMatch[1].trim());

    if (currentMode === "section") {
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error("Invalid AI response structure");
      }
      const items = parsed.items.map((item: any, ii: number) => ({
        label: item.label,
        type: item.type || "YESNO",
        required: item.required ?? true,
        sort_order: ii + 1,
        help_text: item.help_text || null,
      }));
      return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      if (!parsed.sections || !Array.isArray(parsed.sections)) {
        throw new Error("Invalid AI response structure");
      }
      const sections = parsed.sections.map((s: any, si: number) => ({
        title: s.title,
        sort_order: si + 1,
        items: (s.items || []).map((item: any, ii: number) => ({
          label: item.label,
          type: item.type || "YESNO",
          required: item.required ?? true,
          sort_order: ii + 1,
          help_text: item.help_text || null,
        })),
      }));
      return new Response(JSON.stringify({ sections }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Failed to generate suggestions" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
