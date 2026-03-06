import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

interface OrgContextValue {
  organizations: { id: string; name?: string }[];
  organizationId: string | null;
  setOrganizationId: (organizationId: string | null) => void;
}

const OrgContext = createContext<OrgContextValue>({
  organizations: [],
  organizationId: null,
  setOrganizationId: () => {},
});

const getStorageKey = (userId: string) => `selected-organization:${userId}`;

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user, role, organizations, organizationId: authOrganizationId } = useAuth();
  const [organizationId, setOrganizationIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !role) {
      setOrganizationIdState(null);
      return;
    }

    if (role === "host") {
      setOrganizationIdState(user.id);
      return;
    }

    if (organizations.length === 1) {
      setOrganizationIdState(organizations[0].id);
      return;
    }

    if (organizations.length > 1) {
      const savedOrganizationId = localStorage.getItem(getStorageKey(user.id));
      if (savedOrganizationId && organizations.some((organization) => organization.id === savedOrganizationId)) {
        setOrganizationIdState(savedOrganizationId);
      } else {
        setOrganizationIdState(null);
      }
      return;
    }

    setOrganizationIdState(authOrganizationId);
  }, [user, role, organizations, authOrganizationId]);

  const setOrganizationId = (nextOrganizationId: string | null) => {
    if (!user || !role) return;

    if (role === "host") {
      setOrganizationIdState(user.id);
      return;
    }

    if (organizations.length === 1) {
      setOrganizationIdState(organizations[0].id);
      return;
    }

    if (nextOrganizationId && !organizations.some((organization) => organization.id === nextOrganizationId)) {
      return;
    }

    setOrganizationIdState(nextOrganizationId);
    if (nextOrganizationId) {
      localStorage.setItem(getStorageKey(user.id), nextOrganizationId);
    } else {
      localStorage.removeItem(getStorageKey(user.id));
    }
  };

  const value = useMemo<OrgContextValue>(() => ({
    organizations,
    organizationId,
    setOrganizationId,
  }), [organizations, organizationId]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  return useContext(OrgContext);
}
