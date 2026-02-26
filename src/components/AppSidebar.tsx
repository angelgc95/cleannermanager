import {
  CalendarDays,
  LayoutDashboard,
  ClipboardCheck,
  Clock,
  Receipt,
  Wrench,
  ShoppingCart,
  DollarSign,
  BookOpen,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { cn } from "@/lib/utils";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["host", "cleaner"] },
  { title: "Calendar", url: "/calendar", icon: CalendarDays, roles: ["host", "cleaner"] },
  { title: "Checklists", url: "/tasks", icon: ClipboardCheck, roles: ["host", "cleaner"] },
  { title: "Log Hours", url: "/hours", icon: Clock, roles: ["host", "cleaner"] },
  { title: "Expenses", url: "/expenses", icon: Receipt, roles: ["host", "cleaner"] },
  { title: "Maintenance", url: "/maintenance", icon: Wrench, roles: ["host", "cleaner"] },
  { title: "Shopping List", url: "/shopping", icon: ShoppingCart, roles: ["host", "cleaner"] },
  { title: "Payouts", url: "/payouts", icon: DollarSign, roles: ["host", "cleaner"] },
];

const bottomNavItems = [
  { title: "Guides", url: "/guides", icon: BookOpen, roles: ["host", "cleaner"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["host", "cleaner"] },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const filterByRole = (items: typeof mainNavItems) =>
    items.filter((item) => !role || item.roles.includes(role));

  const displayName = user?.email?.split("@")[0] || "User";

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        {!collapsed && (
          <span className="font-semibold text-sm text-sidebar-primary-foreground truncate">
            Cleaning Manager
          </span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {filterByRole(mainNavItems).map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className={cn(
              "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0"
            )}
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border shrink-0">
        <div className="py-2">
          {filterByRole(bottomNavItems).map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0"
              )}
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </NavLink>
          ))}
        </div>

        {/* User info + sign out */}
        <div className="border-t border-sidebar-border px-2 py-3">
          {!collapsed && (
            <div className="px-3 mb-2">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
              {role && (
                <span
                  className={cn(
                    "inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize",
                    role === "host"
                      ? "bg-primary/15 text-primary"
                      : "bg-accent text-accent-foreground"
                  )}
                >
                  {role}
                </span>
              )}
            </div>
          )}
          {collapsed && role && (
            <div className="flex justify-center mb-2">
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                  role === "host"
                    ? "bg-primary/15 text-primary"
                    : "bg-accent text-accent-foreground"
                )}
              >
                {role === "host" ? "H" : "C"}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-sidebar-accent transition-colors text-sidebar-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
