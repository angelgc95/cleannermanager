import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "host" | "cleaner";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  hostIds: string[];
  organizations: { id: string; name?: string }[];
  organizationId: string | null;
  hostId: string | null; // For hosts: own user_id. For cleaners: host_user_id from assignments.
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  hostIds: [],
  organizations: [],
  organizationId: null,
  hostId: null,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [hostIds, setHostIds] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name?: string }[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);

  const fetchRoleAndHost = async (userId: string) => {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .single();

    const userRole = (roleData?.role as AppRole) || null;
    setRole(userRole);

    if (userRole === "host") {
      setHostIds([userId]);
      setOrganizations([{ id: userId }]);
      setOrganizationId(userId);
      setHostId(userId);
    } else if (userRole === "cleaner") {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("host_user_id")
        .eq("cleaner_user_id", userId)
        .order("created_at", { ascending: true });

      const uniqueHostIds = [
        ...new Set((assignments || []).map((assignment) => assignment.host_user_id).filter((id): id is string => !!id)),
      ];

      let organizationOptions: { id: string; name?: string }[] = uniqueHostIds.map((id) => ({ id }));
      if (uniqueHostIds.length > 0) {
        const { data: hostProfiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", uniqueHostIds);
        const nameByUserId = new Map((hostProfiles || []).map((profile) => [profile.user_id, profile.name || undefined]));
        organizationOptions = uniqueHostIds.map((id) => ({ id, name: nameByUserId.get(id) }));
      }

      setHostIds(uniqueHostIds);
      setOrganizations(organizationOptions);
      setOrganizationId(uniqueHostIds.length === 1 ? uniqueHostIds[0] : null);
      setHostId(uniqueHostIds.length === 1 ? uniqueHostIds[0] : null);
    } else {
      setHostIds([]);
      setOrganizations([]);
      setOrganizationId(null);
      setHostId(null);
    }
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchRoleAndHost(session.user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setTimeout(() => fetchRoleAndHost(session.user.id), 0);
      } else {
        setRole(null);
        setHostIds([]);
        setOrganizations([]);
        setOrganizationId(null);
        setHostId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchRoleAndHost(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      role,
      hostIds,
      organizations,
      organizationId,
      hostId,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
