import { supabase } from "@/integrations/supabase/client";
import type { V1Role } from "@/v1/types";

export const db = supabase as any;

const consoleRoles: V1Role[] = ["OWNER", "ORG_ADMIN", "MANAGER", "QA"];

export function getPrimaryRole(roles: V1Role[]): V1Role | null {
  const order: V1Role[] = ["OWNER", "ORG_ADMIN", "MANAGER", "QA", "CLEANER"];
  for (const role of order) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function isConsoleRole(role: V1Role | null) {
  return !!role && consoleRoles.includes(role);
}

export function isManagerRole(role: V1Role | null) {
  return role === "OWNER" || role === "ORG_ADMIN" || role === "MANAGER";
}
