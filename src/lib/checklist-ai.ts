import type { Json } from "@/integrations/supabase/types";

export type CleanerExperienceLevel = 1 | 2 | 3;

export interface ListingAiContext {
  listingType: string;
  amenities: string[];
  actionableInfo: string;
}

export const LISTING_TYPE_OPTIONS = [
  { value: "apartment", label: "Apartment" },
  { value: "studio", label: "Studio" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  { value: "loft", label: "Loft" },
  { value: "private-room", label: "Private room" },
  { value: "shared-room", label: "Shared room" },
  { value: "cabin", label: "Cabin" },
  { value: "beach-home", label: "Beach home" },
  { value: "other", label: "Other" },
] as const;

export const CLEANER_EXPERIENCE_CONTENT: Record<
  CleanerExperienceLevel,
  { label: string; title: string; summary: string }
> = {
  1: {
    label: "1",
    title: "New cleaner",
    summary: "Detailed step-by-step guidance from preparation to finish, with more verification and reminders.",
  },
  2: {
    label: "2",
    title: "Intermediate cleaner",
    summary: "Balanced guidance with clear verification, but less hand-holding than level 1.",
  },
  3: {
    label: "3",
    title: "Experienced cleaner",
    summary: "Concise checklist focused on essentials, verification, and guest-ready final state.",
  },
};

const DEFAULT_LISTING_CONTEXT: ListingAiContext = {
  listingType: "apartment",
  amenities: [],
  actionableInfo: "",
};

export function normalizeCleanerExperienceLevel(
  value: number | string | null | undefined,
): CleanerExperienceLevel {
  const numeric = Number(value);
  if (numeric <= 1) return 1;
  if (numeric >= 3) return 3;
  return 2;
}

export function parseAmenitiesInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getListingTypeLabel(value: string): string {
  return LISTING_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function normalizeListingAiContext(value: Partial<ListingAiContext> | Json | null | undefined): ListingAiContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_LISTING_CONTEXT };
  }

  const record = value as Record<string, unknown>;
  const listingType = typeof record.listingType === "string" && record.listingType.trim()
    ? record.listingType.trim()
    : DEFAULT_LISTING_CONTEXT.listingType;
  const amenities = Array.isArray(record.amenities)
    ? record.amenities.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
  const actionableInfo = typeof record.actionableInfo === "string" ? record.actionableInfo.trim() : "";

  return { listingType, amenities, actionableInfo };
}

export function buildListingDescription(context: ListingAiContext): string {
  const lines = [`Listing type: ${context.listingType}.`];

  if (context.amenities.length > 0) {
    lines.push(`Amenities and notable features: ${context.amenities.join(", ")}.`);
  }

  if (context.actionableInfo.trim()) {
    lines.push(`Actionable hosting notes: ${context.actionableInfo.trim()}.`);
  }

  return lines.join(" ");
}
