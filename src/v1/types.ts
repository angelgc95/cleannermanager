export type V1Role = "OWNER" | "ORG_ADMIN" | "MANAGER" | "QA" | "CLEANER";
export type V1ScopeType = "ORG" | "UNIT" | "LISTING";

export interface V1Organization {
  id: string;
  name: string;
  billing_tier?: string;
  listing_limit?: number;
}

export interface V1OrganizationMember {
  organization_id: string;
  user_id: string;
  role: V1Role;
}

export interface V1RoleAssignment {
  id: string;
  organization_id: string;
  user_id: string;
  role: V1Role;
  scope_type: V1ScopeType;
  scope_id: string | null;
}

export interface V1Listing {
  id: string;
  organization_id: string;
  unit_id: string;
  name: string;
  ical_url: string | null;
  active: boolean;
}

export interface V1Event {
  id: string;
  organization_id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  start_at: string;
  end_at: string;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}
