import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

const tabs = [
  { to: "/field", label: "Today" },
  { to: "/field/calendar", label: "Calendar" },
  { to: "/field/checklist", label: "Checklist" },
  { to: "/field/extras", label: "Extras" },
  { to: "/field/guides", label: "Guides" },
  { to: "/field/notifications", label: "Alerts" },
];

export default function FieldLayout() {
  const { user, organizationId } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    const loadUnread = async () => {
      let query = db
        .from("v1_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .is("read_at", null);

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { count } = await query;
      if (active) {
        setUnreadCount(count || 0);
      }
    };

    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [organizationId, user?.id]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">Field App</h1>
        <Link to="/field/notifications" className="relative rounded border border-border p-2 text-muted-foreground hover:bg-muted">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
      </header>
      <div className="px-4 py-4">
        <Outlet />
      </div>
      <nav className="fixed bottom-0 left-0 right-0 grid grid-cols-6 border-t border-border bg-card">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/field"}
            className={({ isActive }) =>
              cn(
                "px-2 py-3 text-center text-xs font-medium text-muted-foreground",
                isActive && "text-primary",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
