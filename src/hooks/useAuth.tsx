import { useState, useEffect, createContext, useContext, ReactNode, useMemo } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { db, getPrimaryRole, isConsoleRole } from "@/v1/lib/db";
import type { V1Organization, V1OrganizationMember, V1Role, V1RoleAssignment } from "@/v1/types";

type LegacyRole = "host" | "cleaner";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;

  // New model
  primaryRole: V1Role | null;
  v1Roles: V1Role[];
  organizationsV1: V1Organization[];
  memberships: V1OrganizationMember[];
  roleAssignments: V1RoleAssignment[];
  organizationId: string | null;
  setOrganizationId: (organizationId: string | null) => void;
  canAccessConsole: boolean;
  canAccessField: boolean;

  // Legacy compatibility (for untouched files)
  role: LegacyRole | null;
  hostIds: string[];
  organizations: { id: string; name?: string }[];
  hostId: string | null;

  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  primaryRole: null,
  v1Roles: [],
  organizationsV1: [],
  memberships: [],
  roleAssignments: [],
  organizationId: null,
  setOrganizationId: () => {},
  canAccessConsole: false,
  canAccessField: false,
  role: null,
  hostIds: [],
  organizations: [],
  hostId: null,
  refreshProfile: async () => {},
});

function uniqueRoles(rows: Array<{ role?: string | null }>): V1Role[] {
  return [...new Set(rows.map((row) => row.role).filter(Boolean) as V1Role[])];
}

function getOrgStorageKey(userId: string) {
  return `v1-active-org:${userId}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [primaryRole, setPrimaryRole] = useState<V1Role | null>(null);
  const [v1Roles, setV1Roles] = useState<V1Role[]>([]);
  const [organizationsV1, setOrganizationsV1] = useState<V1Organization[]>([]);
  const [memberships, setMemberships] = useState<V1OrganizationMember[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<V1RoleAssignment[]>([]);
  const [organizationId, setOrganizationIdState] = useState<string | null>(null);

  const legacyRole: LegacyRole | null = useMemo(() => {
    if (!primaryRole) return null;
    return primaryRole === "CLEANER" ? "cleaner" : "host";
  }, [primaryRole]);

  const hostIds = useMemo(() => organizationsV1.map((organization) => organization.id), [organizationsV1]);
  const hostId = hostIds.length === 1 ? hostIds[0] : null;
  const organizations = useMemo(
    () => organizationsV1.map((organization) => ({ id: organization.id, name: organization.name })),
    [organizationsV1],
  );

  const canAccessConsole = isConsoleRole(primaryRole);
  const canAccessField = primaryRole === "CLEANER" || primaryRole === "MANAGER";

  const setOrganizationId = (nextOrganizationId: string | null) => {
    setOrganizationIdState(nextOrganizationId);
    if (!session?.user) return;

    const key = getOrgStorageKey(session.user.id);
    if (nextOrganizationId) {
      localStorage.setItem(key, nextOrganizationId);
    } else {
      localStorage.removeItem(key);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const [{ data: memberRows }, { data: assignmentRows }] = await Promise.all([
        db
          .from("v1_organization_members")
          .select("organization_id, user_id, role")
          .eq("user_id", userId),
        db
          .from("v1_role_assignments")
          .select("id, organization_id, user_id, role, scope_type, scope_id")
          .eq("user_id", userId),
      ]);

      const normalizedMembers = (memberRows || []) as V1OrganizationMember[];
      const normalizedAssignments = (assignmentRows || []) as V1RoleAssignment[];

      setMemberships(normalizedMembers);
      setRoleAssignments(normalizedAssignments);

      const orgIds = [...new Set([
        ...normalizedMembers.map((row) => row.organization_id),
        ...normalizedAssignments.map((row) => row.organization_id),
      ])];

      if (orgIds.length === 0) {
        setOrganizationsV1([]);
        setV1Roles([]);
        setPrimaryRole(null);
        setOrganizationIdState(null);
        return;
      }

      const { data: orgRows } = await db
        .from("v1_organizations")
        .select("id, name, billing_tier, listing_limit")
        .in("id", orgIds)
        .order("created_at", { ascending: true });

      const organizationsData = (orgRows || []) as V1Organization[];
      setOrganizationsV1(organizationsData);

      const allRoles = uniqueRoles([...normalizedMembers, ...normalizedAssignments]);
      setV1Roles(allRoles);
      setPrimaryRole(getPrimaryRole(allRoles));

      const orgSet = new Set(organizationsData.map((row) => row.id));
      const storedOrg = localStorage.getItem(getOrgStorageKey(userId));
      if (storedOrg && orgSet.has(storedOrg)) {
        setOrganizationIdState(storedOrg);
      } else {
        setOrganizationIdState(organizationsData[0]?.id || null);
      }
    } catch (error) {
      console.warn("v1 auth profile load failed", error);
      setOrganizationsV1([]);
      setMemberships([]);
      setRoleAssignments([]);
      setV1Roles([]);
      setPrimaryRole(null);
      setOrganizationIdState(null);
    }
  };

  const refreshProfile = async () => {
    if (!session?.user?.id) return;
    await fetchProfile(session.user.id);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user) {
        setTimeout(() => {
          fetchProfile(nextSession.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setOrganizationsV1([]);
        setMemberships([]);
        setRoleAssignments([]);
        setV1Roles([]);
        setPrimaryRole(null);
        setOrganizationIdState(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      if (existingSession?.user) {
        fetchProfile(existingSession.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        primaryRole,
        v1Roles,
        organizationsV1,
        memberships,
        roleAssignments,
        organizationId,
        setOrganizationId,
        canAccessConsole,
        canAccessField,
        role: legacyRole,
        hostIds,
        organizations,
        hostId,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
