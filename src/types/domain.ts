import type { Tables } from "@/integrations/supabase/types";

// Re-export row types with friendly names
export type CleaningEvent = Tables<"cleaning_events"> & {
  listings?: { name: string; timezone?: string | null } | null;
};

export type MaintenanceTicket = Tables<"maintenance_tickets"> & {
  listings?: { name: string } | null;
};

export type ShoppingListItem = Tables<"shopping_list"> & {
  products?: { name: string; category: string | null } | null;
};

export type TaskItem = Tables<"tasks">;

export type PricingSuggestion = Tables<"pricing_suggestions"> & {
  listings?: { name: string } | null;
};

export type Product = Tables<"products">;

export type Submission = Tables<"shopping_submissions">;
