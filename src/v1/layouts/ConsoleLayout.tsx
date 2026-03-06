import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/console", label: "Overview" },
  { to: "/console/hierarchy", label: "Hierarchy" },
  { to: "/console/listings", label: "Listings" },
  { to: "/console/people", label: "People & Roles" },
  { to: "/console/assignments", label: "Assignments" },
  { to: "/console/operations", label: "Operations Calendar" },
  { to: "/console/inbox", label: "Ops Inbox" },
  { to: "/console/qa", label: "QA Review" },
  { to: "/console/templates", label: "Templates" },
  { to: "/console/automations", label: "Automations" },
  { to: "/console/reports", label: "Reports" },
];

export default function ConsoleLayout() {
  const { organizationsV1, organizationId, setOrganizationId, user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-border bg-card p-4">
          <Link to="/console" className="mb-6 block text-lg font-semibold">
            Ops Console
          </Link>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/console"}
                className={({ isActive }) =>
                  cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                    isActive ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1">
          <header className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Organization</span>
              <Select
                value={organizationId || "__none"}
                onValueChange={(value) => setOrganizationId(value === "__none" ? null : value)}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizationsV1.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
                Sign out
              </Button>
            </div>
          </header>

          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
