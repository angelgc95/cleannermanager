import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "host" | "cleaner";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  hostId: string | null; // For hosts: own user_id. For cleaners: connected host_user_id.
  profileComplete: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  hostId: null,
  profileComplete: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(true);

  const fetchRoleAndHost = async (userId: string) => {
    const [{ data: roleRows }, { data: profileData }, { data: connection }, { data: assignment }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .returns<{ role: AppRole }[]>(),
      supabase
        .from("profiles")
        .select("setup_completed")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("host_cleaners")
        .select("host_user_id")
        .eq("cleaner_user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cleaner_assignments")
        .select("host_user_id")
        .eq("cleaner_user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

    const connectedHostId = connection?.host_user_id || assignment?.host_user_id || null;
    const roleSet = new Set((roleRows || []).map((row) => row.role as AppRole));

    let userRole: AppRole | null = null;
    if (connectedHostId) {
      userRole = "cleaner";
    } else if (roleSet.has("host")) {
      userRole = "host";
    } else if (roleSet.has("cleaner")) {
      userRole = "cleaner";
    }

    setRole(userRole);
    setProfileComplete(profileData?.setup_completed ?? true);

    if (userRole === "host") {
      setHostId(userId);
    } else if (userRole === "cleaner") {
      setHostId(connectedHostId);
    } else {
      setHostId(null);
    }
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchRoleAndHost(session.user.id);
    }
  };

  useEffect(() => {
    let isActive = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!isActive) return;

      setSession(nextSession);
      if (!nextSession?.user) {
        setRole(null);
        setHostId(null);
        setProfileComplete(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await fetchRoleAndHost(nextSession.user.id);
      } catch (error) {
        console.error("Failed to resolve auth role", error);
        if (!isActive) return;
        setRole(null);
        setHostId(null);
        setProfileComplete(true);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncSession(session);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, role, hostId, profileComplete, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
