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
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Cleaning Tasks", url: "/tasks", icon: ClipboardCheck },
  { title: "Log Hours", url: "/hours", icon: Clock },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Maintenance", url: "/maintenance", icon: Wrench },
  { title: "Shopping List", url: "/shopping", icon: ShoppingCart },
  { title: "Payouts", url: "/payouts", icon: DollarSign },
  { title: "Guides", url: "/guides", icon: BookOpen },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border">
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

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
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

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
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
    </aside>
  );
}
