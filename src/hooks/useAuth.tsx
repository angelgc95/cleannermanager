import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "host" | "cleaner";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  hostId: string | null; // For hosts: own user_id. For cleaners: host_user_id from assignments.
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  hostId: null,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
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
      setHostId(userId);
    } else if (userRole === "cleaner") {
      // Get host_user_id from first assignment
      const { data: assignment } = await supabase
        .from("cleaner_assignments")
        .select("host_user_id")
        .eq("cleaner_user_id", userId)
        .limit(1)
        .single();
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
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, role, hostId, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
