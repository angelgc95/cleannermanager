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
    const [{ data: roleData }, { data: profileData }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("setup_completed")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const userRole = (roleData?.role as AppRole) || null;
    setRole(userRole);
    setProfileComplete(profileData?.setup_completed ?? true);

    if (userRole === "host") {
      setHostId(userId);
    } else if (userRole === "cleaner") {
      const { data: connection } = await supabase
        .from("host_cleaners")
        .select("host_user_id")
        .eq("cleaner_user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (connection?.host_user_id) {
        setHostId(connection.host_user_id);
        return;
      }

      // Fallback for legacy data that only has assignments.
      const { data: assignment } = await supabase
        .from("cleaner_assignments")
        .select("host_user_id")
        .eq("cleaner_user_id", userId)
        .limit(1)
        .maybeSingle();

      setHostId(assignment?.host_user_id || null);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setTimeout(() => fetchRoleAndHost(session.user.id), 0);
      } else {
        setRole(null);
        setHostId(null);
        setProfileComplete(true);
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

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, role, hostId, profileComplete, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
