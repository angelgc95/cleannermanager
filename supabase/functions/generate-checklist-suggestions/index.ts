import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CleanerExperienceLevel = 1 | 2 | 3;
type SuggestionMode = "template" | "section";

interface ListingContext {
  listingType: string;
  amenities: string[];
  actionableInfo: string;
}

interface RawItem {
  label?: string;
  type?: string;
  required?: boolean;
  help_text?: string | null;
  timer_minutes?: number | null;
}

interface RawSection {
  title?: string;
  items?: RawItem[];
}

type ResponseFormatSchema = Record<string, unknown>;

const AIRBNB_RESOURCE_PRIORITIES = [
  "Prioritize high-touch surfaces and frequently used items.",
  "Air out rooms, refresh floors, and leave the home visibly guest-ready.",
  "Always account for fresh linens, towels, and bathroom essentials.",
  "For kitchens, check dishes, cookware, dish soap, drying tools, and simple consumables when relevant.",
  "Include house-manual or device-readiness checks when the listing depends on them.",
  "Use listing-specific extras only when they are actually relevant to the property description or amenities.",
];

const EXPERIENCE_PROFILES: Record<CleanerExperienceLevel, {
  title: string;
  sectionCount: string;
  itemCount: string;
  style: string[];
}> = {
  1: {
    title: "new cleaner",
    sectionCount: "6-8",
    itemCount: "5-9",
    style: [
      "Write detailed, step-by-step instructions from preparation to finish.",
      "Add clarifying help_text for most required items.",
      "Use more verification photos, especially for kitchen, bathroom, beds, and final guest-ready checks.",
      "Assume the cleaner needs explicit reminders about restocking, staging, and final presentation.",
    ],
  },
  2: {
    title: "intermediate cleaner",
    sectionCount: "5-7",
    itemCount: "4-7",
    style: [
      "Write balanced guidance with practical verification but without over-explaining basics.",
      "Use help_text only when it adds operational value.",
      "Keep photo items focused on proof of completion and issue reporting.",
    ],
  },
  3: {
    title: "experienced cleaner",
    sectionCount: "4-6",
    itemCount: "3-6",
    style: [
      "Keep the checklist concise and operational.",
      "Avoid teaching basic cleaning technique unless the listing has a specific quirk.",
      "Focus on essentials, guest-ready final state, and a few strong verification photos.",
      "Minimize repetitive reminders and only keep resets/checks that matter operationally.",
    ],
  },
};

function normalizeCleanerExperienceLevel(value: unknown): CleanerExperienceLevel {
  const numeric = Number(value);
  if (numeric <= 1) return 1;
  if (numeric >= 3) return 3;
  return 2;
}

function normalizeListingContext(value: unknown): ListingContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { listingType: "apartment", amenities: [], actionableInfo: "" };
  }

  const record = value as Record<string, unknown>;
  return {
    listingType: typeof record.listingType === "string" && record.listingType.trim()
      ? record.listingType.trim()
      : "apartment",
    amenities: Array.isArray(record.amenities)
      ? record.amenities.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
      : [],
    actionableInfo: typeof record.actionableInfo === "string" ? record.actionableInfo.trim() : "",
  };
}

function buildPropertyDescription(description: string | undefined, listingContext: ListingContext): string {
  const parts: string[] = [];

  if (description && description.trim()) {
    parts.push(description.trim());
  }

  if (!parts.length) {
    parts.push(`Listing type: ${listingContext.listingType}.`);
    if (listingContext.amenities.length > 0) {
      parts.push(`Amenities: ${listingContext.amenities.join(", ")}.`);
    }
    if (listingContext.actionableInfo) {
      parts.push(`Operational notes: ${listingContext.actionableInfo}.`);
    }
  }

  return parts.join(" ");
}

function jsonContent(content: string): unknown {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  return JSON.parse((jsonMatch[1] || content).trim());
}

function normalizedItemType(value: unknown): "YESNO" | "PHOTO" | "TEXT" | "NUMBER" {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  if (upper === "PHOTO" || upper === "TEXT" || upper === "NUMBER") return upper;
  return "YESNO";
}

function normalizeTimerMinutes(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function buildPhotoLabel(sectionTitle: string): string {
  return `Photo of ${sectionTitle.toLowerCase()}`;
}

function normalizeItems(
  items: RawItem[] | undefined,
  sectionTitle: string,
  experienceLevel: CleanerExperienceLevel,
): Array<{
  label: string;
  type: "YESNO" | "PHOTO" | "TEXT" | "NUMBER";
  required: boolean;
  sort_order: number;
  help_text: string | null;
  timer_minutes: number | null;
}> {
  const profile = EXPERIENCE_PROFILES[experienceLevel];
  const normalized = (items || [])
    .filter((item) => typeof item?.label === "string" && item.label.trim().length > 0)
    .slice(0, experienceLevel === 1 ? 10 : 8)
    .map((item, index) => {
      const type = normalizedItemType(item.type);
      let helpText = typeof item.help_text === "string" && item.help_text.trim() ? item.help_text.trim() : null;

      if (experienceLevel === 1 && !helpText && type === "YESNO") {
        helpText = `Complete this ${sectionTitle.toLowerCase()} step before moving on.`;
      }
      if (experienceLevel === 1 && !helpText && type === "PHOTO") {
        helpText = "Take a clear proof photo after this area is ready for the guest.";
      }
      if (experienceLevel === 3 && type !== "PHOTO" && helpText && helpText.length < 90) {
        helpText = null;
      }

      return {
        label: item.label!.trim(),
        type,
        required: item.required ?? type !== "PHOTO",
        sort_order: index + 1,
        help_text: helpText,
        timer_minutes: normalizeTimerMinutes(item.timer_minutes),
      };
    });

  if (!normalized.some((item) => item.type === "PHOTO")) {
    normalized.push({
      label: buildPhotoLabel(sectionTitle),
      type: "PHOTO",
      required: experienceLevel === 1,
      sort_order: normalized.length + 1,
      help_text: experienceLevel === 3
        ? "Capture the finished result."
        : "Take a clear photo once this area is guest-ready.",
      timer_minutes: null,
    });
  }

  return normalized.map((item, index) => ({ ...item, sort_order: index + 1 }));
}

function buildEssentialsSection(listingContext: ListingContext, experienceLevel: CleanerExperienceLevel) {
  const amenityText = listingContext.amenities.join(" ").toLowerCase();
  const kitchenRelevant = amenityText.includes("kitchen") || amenityText.includes("coffee") || amenityText.includes("dishwasher") || amenityText.includes("cook");
  const bathroomRelevant = true;
  const bedroomRelevant = true;

  const items = [
    {
      label: "Restock toilet paper, hand soap, and body-wash essentials",
      type: "YESNO" as const,
      required: true,
      sort_order: 1,
      help_text: experienceLevel === 1 ? "Check each bathroom and replace low supplies before leaving." : null,
      timer_minutes: null,
    },
    {
      label: "Confirm fresh towels and bed linen are ready for the next guest",
      type: "YESNO" as const,
      required: true,
      sort_order: 2,
      help_text: experienceLevel === 1 ? "Match towels and linen to the expected guest setup." : null,
      timer_minutes: null,
    },
  ];

  if (kitchenRelevant) {
    items.push({
      label: "Check kitchen basics like dish soap, sponge, drying tools, and core cookware",
      type: "YESNO" as const,
      required: true,
      sort_order: items.length + 1,
      help_text: experienceLevel === 1 ? "Make sure the kitchen is stocked and ready to use immediately." : null,
      timer_minutes: null,
    });
  }

  if (bathroomRelevant && experienceLevel === 1) {
    items.push({
      label: "Verify bathroom staging looks tidy and hotel-ready",
      type: "PHOTO" as const,
      required: false,
      sort_order: items.length + 1,
      help_text: "Include towels, toiletries, and clear sink or counter surfaces.",
      timer_minutes: null,
    });
  }

  if (bedroomRelevant && experienceLevel >= 2) {
    items.push({
      label: "Photo of essentials and welcome-ready final setup",
      type: "PHOTO" as const,
      required: false,
      sort_order: items.length + 1,
      help_text: "Capture a proof photo of the final staged setup.",
      timer_minutes: null,
    });
  }

  return {
    title: "Essentials & Restocking",
    sort_order: 0,
    items,
  };
}

function buildFinalChecksSection(experienceLevel: CleanerExperienceLevel) {
  return {
    title: "Final Checks",
    sort_order: 0,
    items: [
      {
        label: "Check doors, windows, lights, and climate settings before leaving",
        type: "YESNO" as const,
        required: true,
        sort_order: 1,
        help_text: experienceLevel === 1 ? "Do a full last walk-through before closing the property." : null,
        timer_minutes: null,
      },
      {
        label: "Make sure the home matches the guest-ready standard shown in the listing",
        type: "YESNO" as const,
        required: true,
        sort_order: 2,
        help_text: experienceLevel === 1 ? "Pause at the entrance and visually confirm the overall result." : null,
        timer_minutes: null,
      },
      {
        label: "Photo of final guest-ready state",
        type: "PHOTO" as const,
        required: experienceLevel === 1,
        sort_order: 3,
        help_text: "Capture the final proof photo before checkout.",
        timer_minutes: null,
      },
    ],
  };
}

function buildPreparationSection(experienceLevel: CleanerExperienceLevel) {
  return {
    title: experienceLevel === 1 ? "Preparation & Setup" : "Arrival & Check-In",
    sort_order: 0,
    items: [
      {
        label: "Open the property and check the overall starting condition",
        type: "YESNO" as const,
        required: true,
        sort_order: 1,
        help_text: experienceLevel === 1 ? "Scan every room first so you know what needs attention." : null,
        timer_minutes: null,
      },
      {
        label: "Air out the home if needed before starting",
        type: "YESNO" as const,
        required: false,
        sort_order: 2,
        help_text: experienceLevel === 1 ? "Open windows briefly when weather and safety allow it." : null,
        timer_minutes: experienceLevel === 1 ? 10 : null,
      },
      {
        label: "Photo of property condition on arrival",
        type: "PHOTO" as const,
        required: false,
        sort_order: 3,
        help_text: "Capture the starting condition if anything is notable.",
        timer_minutes: null,
      },
    ],
  };
}

function ensureSection(
  sections: Array<{
    title: string;
    sort_order: number;
    items: Array<{
      label: string;
      type: "YESNO" | "PHOTO" | "TEXT" | "NUMBER";
      required: boolean;
      sort_order: number;
      help_text: string | null;
      timer_minutes: number | null;
    }>;
  }>,
  matcher: RegExp,
  builder: () => {
    title: string;
    sort_order: number;
    items: Array<{
      label: string;
      type: "YESNO" | "PHOTO" | "TEXT" | "NUMBER";
      required: boolean;
      sort_order: number;
      help_text: string | null;
      timer_minutes: number | null;
    }>;
  },
) {
  if (sections.some((section) => matcher.test(section.title))) {
    return sections;
  }
  return [...sections, builder()];
}

function normalizeSections(
  sections: RawSection[] | undefined,
  listingContext: ListingContext,
  experienceLevel: CleanerExperienceLevel,
) {
  let normalized = (sections || [])
    .filter((section) => typeof section?.title === "string" && section.title.trim().length > 0)
    .slice(0, experienceLevel === 1 ? 8 : 7)
    .map((section, index) => ({
      title: section.title!.trim(),
      sort_order: index + 1,
      items: normalizeItems(section.items, section.title!.trim(), experienceLevel),
    }));

  normalized = ensureSection(normalized, /(arrival|check-?in|prep|setup)/i, () => buildPreparationSection(experienceLevel));
  normalized = ensureSection(normalized, /(essential|restock|supply)/i, () => buildEssentialsSection(listingContext, experienceLevel));
  normalized = ensureSection(normalized, /(final|checkout|guest-ready)/i, () => buildFinalChecksSection(experienceLevel));

  return normalized.map((section, index) => ({
    ...section,
    sort_order: index + 1,
    items: section.items.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 })),
  }));
}

function buildSystemPrompt(
  mode: SuggestionMode,
  experienceLevel: CleanerExperienceLevel,
  listingContext: ListingContext,
): string {
  const profile = EXPERIENCE_PROFILES[experienceLevel];
  const structuredContext = {
    cleaner_experience_level: experienceLevel,
    cleaner_profile: profile.title,
    listing_type: listingContext.listingType,
    amenities: listingContext.amenities,
    actionable_notes: listingContext.actionableInfo,
    airbnb_preparation_focus: AIRBNB_RESOURCE_PRIORITIES,
  };

  if (mode === "section") {
    return `You design operational cleaning checklist items for short-term rental properties.

Use this structured context:
${JSON.stringify(structuredContext, null, 2)}

Behavior requirements:
- The cleaner is a ${profile.title}.
- ${profile.style.join("\n- ")}
- Keep suggestions aligned with the listing type, amenities, and operational notes.
- Reflect Airbnb-style preparation priorities: guest-ready presentation, fresh linens and towels, bathroom and kitchen essentials, and final readiness checks.
- Generate 4-8 items for the requested section.
- Use item types YESNO, PHOTO, TEXT, or NUMBER only.
- Most items should be YESNO.
- Use PHOTO items for proof and issue capture.
- You may include timer_minutes only for truly time-based steps.

Respond with ONLY valid JSON in this exact format:
{
  "items": [
    { "label": "Item description", "type": "YESNO", "required": true, "help_text": null, "timer_minutes": null }
  ]
}`;
  }

  return `You design high-quality cleaning checklist templates for short-term rental properties.

Use this structured context:
${JSON.stringify(structuredContext, null, 2)}

Behavior requirements:
- The cleaner is a ${profile.title}.
- Create ${profile.sectionCount} sections.
- Create ${profile.itemCount} items per section.
- ${profile.style.join("\n- ")}
- Tailor the checklist to the specific listing type, amenities, and operational notes.
- Reflect Airbnb-style hosting readiness:
  - cover high-touch surfaces and heavily used areas,
  - make the home visibly guest-ready,
  - include fresh linens and towels,
  - account for bathroom and kitchen essentials,
  - include final readiness and device/manual checks when relevant.
- Skip irrelevant areas. Do not invent pools, gardens, or specialty features unless the context implies them.
- Always include a preparation/arrival section, an essentials/restocking section, and a final guest-ready checks section.
- Use item types YESNO, PHOTO, TEXT, or NUMBER only.
- Most items should be YESNO.
- Include at least one PHOTO item in every section.
- Use TEXT and NUMBER sparingly for operational exceptions, counts, or reporting.
- You may include timer_minutes only for truly time-based steps.

Respond with ONLY valid JSON in this exact format:
{
  "sections": [
    {
      "title": "Section Name",
      "items": [
        { "label": "Item description", "type": "YESNO", "required": true, "help_text": null, "timer_minutes": null }
      ]
    }
  ]
}`;
}

function buildResponseFormat(mode: SuggestionMode): ResponseFormatSchema {
  const itemSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      label: { type: "string", minLength: 1 },
      type: { type: "string", enum: ["YESNO", "PHOTO", "TEXT", "NUMBER"] },
      required: { type: "boolean" },
      help_text: { type: ["string", "null"] },
      timer_minutes: { type: ["integer", "null"] },
    },
    required: ["label", "type", "required", "help_text", "timer_minutes"],
  };

  if (mode === "section") {
    return {
      type: "json_schema",
      name: "checklist_section_suggestions",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          items: {
            type: "array",
            minItems: 1,
            items: itemSchema,
          },
        },
        required: ["items"],
      },
    };
  }

  return {
    type: "json_schema",
    name: "checklist_template_suggestions",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sections: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", minLength: 1 },
              items: {
                type: "array",
                minItems: 1,
                items: itemSchema,
              },
            },
            required: ["title", "items"],
          },
        },
      },
      required: ["sections"],
    },
  };
}

function extractResponseText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const text = output
    .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "message")
    .flatMap((item) => {
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .filter((part) => part && typeof part === "object" && (part as Record<string, unknown>).type === "output_text")
    .map((part) => (part as Record<string, unknown>).text)
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("OpenAI response did not include output_text");
  }

  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const currentMode = (body.mode || "template") as SuggestionMode;
    const sectionTitle = typeof body.section_title === "string" ? body.section_title.trim() : "Untitled";
    const listingContext = normalizeListingContext(body.listing_context);
    const experienceLevel = normalizeCleanerExperienceLevel(body.cleaner_experience_level);
    const propertyDescription = buildPropertyDescription(
      typeof body.description === "string" ? body.description : "",
      listingContext,
    );

    if (!["template", "section"].includes(currentMode)) {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (propertyDescription.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Description too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(currentMode, experienceLevel, listingContext);
    const responseFormat = buildResponseFormat(currentMode);
    const userContent = currentMode === "section"
      ? JSON.stringify({
        section_title: sectionTitle,
        section_description: propertyDescription,
      }, null, 2)
      : JSON.stringify({
        property_description: propertyDescription,
      }, null, 2);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions: systemPrompt,
        input: userContent,
        reasoning: { effort: "minimal" },
        text: { format: responseFormat },
        max_output_tokens: 4000,
        store: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${text}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const content = extractResponseText(data);
    const parsed = jsonContent(content) as { items?: RawItem[]; sections?: RawSection[] };

    if (currentMode === "section") {
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error("Invalid AI response structure");
      }
      const items = normalizeItems(parsed.items, sectionTitle, experienceLevel);
      return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error("Invalid AI response structure");
    }

    const sections = normalizeSections(parsed.sections, listingContext, experienceLevel);
    return new Response(JSON.stringify({ sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Failed to generate suggestions" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
