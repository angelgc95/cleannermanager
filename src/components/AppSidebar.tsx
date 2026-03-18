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
  Bell,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/i18n/LanguageProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["host", "cleaner"] },
  { title: "Calendar", url: "/calendar", icon: CalendarDays, roles: ["host", "cleaner"] },
  { title: "Checklists", url: "/tasks", icon: ClipboardCheck, roles: ["host", "cleaner"] },
  { title: "Log Hours", url: "/hours", icon: Clock, roles: ["host", "cleaner"] },
  { title: "Expenses", url: "/expenses", icon: Receipt, roles: ["host", "cleaner"] },
  { title: "Maintenance", url: "/maintenance", icon: Wrench, roles: ["host", "cleaner"] },
  { title: "Shopping List", url: "/shopping", icon: ShoppingCart, roles: ["host", "cleaner"] },
  { title: "Payouts", url: "/payouts", icon: DollarSign, roles: ["host", "cleaner"] },
  { title: "Guides", url: "/guides", icon: BookOpen, roles: ["host", "cleaner"] },
];

const mobilePrimaryNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["host", "cleaner"] },
  { title: "Calendar", url: "/calendar", icon: CalendarDays, roles: ["host", "cleaner"] },
  { title: "Checklists", url: "/tasks", icon: ClipboardCheck, roles: ["host", "cleaner"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["host", "cleaner"] },
];

interface InAppNotification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function AppSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { role, user } = useAuth();
  const { t, formatDate } = useI18n();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hideMobileBottomNav = /^\/events\/[^/]+\/checklist$/.test(pathname);
  const isCleaner = role === "cleaner";

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("in_app_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data as InAppNotification[]) || []);
  }, [user]);

  useEffect(() => {
    if (isMobile) {
      setNotifications([]);
      return;
    }
    fetchNotifications();
    if (!user) return;
    const channel = supabase
      .channel("sidebar_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "in_app_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as InAppNotification, ...prev].slice(0, 20));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications, isMobile]);

  const markAsRead = async (id: string) => {
    await supabase.from("in_app_notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("in_app_notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleNotifClick = (n: InAppNotification) => {
    markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setNotifOpen(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMobileMenuOpen(false);
    navigate("/auth");
  };

  const filterByRole = <T extends { roles: string[] }>(items: T[]) =>
    items.filter((item) => !role || item.roles.includes(role));

  const navItems = filterByRole(mainNavItems);
  const mobileItems = filterByRole(mobilePrimaryNavItems);
  const displayName = user?.email?.split("@")[0] || t("User");

  if (isMobile) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-x-0 top-0 z-40 border-b backdrop-blur md:hidden",
            isCleaner
              ? "border-sidebar-border bg-sidebar/95 text-sidebar-foreground supports-[backdrop-filter]:bg-sidebar/90"
              : "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80"
          )}
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex h-14 items-center justify-between px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t("Open navigation")}
              title={t("Open navigation")}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 text-center">
              <p className={cn("text-[10px] uppercase tracking-[0.18em]", isCleaner ? "text-sidebar-foreground/65" : "text-muted-foreground")}>
                {role ? t(role === "host" ? "Host" : "Cleaner") : ""}
              </p>
              <p className={cn("truncate text-sm font-semibold", isCleaner ? "text-sidebar-primary-foreground" : "text-foreground")}>CleannerManager</p>
            </div>
            <NotificationBell />
          </div>
        </div>

        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-[18rem] border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
            <div className="flex h-full flex-col">
              <SheetHeader className="sr-only">
                <SheetTitle>{t("Navigation menu")}</SheetTitle>
                <SheetDescription>{t("Browse all sections of the app.")}</SheetDescription>
              </SheetHeader>
              <div className="border-b border-sidebar-border px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-sidebar-foreground/60">
                  {role ? t(role === "host" ? "Host" : "Cleaner") : t("User")}
                </p>
                <p className="mt-1 truncate text-base font-semibold text-sidebar-primary-foreground">CleannerManager</p>
                <p className="mt-2 truncate text-sm text-sidebar-foreground">{displayName}</p>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                {navItems.map((item) => (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    end={item.url === "/"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{t(item.title)}</span>
                  </NavLink>
                ))}

                <NavLink
                  to="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <Settings className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t("Settings")}</span>
                </NavLink>
              </nav>

              <div className="border-t border-sidebar-border p-2">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span>{t("Sign Out")}</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {!hideMobileBottomNav && (
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden",
              isCleaner
                ? "border-sidebar-border bg-sidebar/95 text-sidebar-foreground supports-[backdrop-filter]:bg-sidebar/90"
                : "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80"
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <nav className="grid grid-cols-4 gap-1 px-2 py-2">
              {mobileItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  end={item.url === "/"}
                  className={cn(
                    "flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition-colors",
                    isCleaner
                      ? "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  activeClassName={isCleaner ? "bg-sidebar-accent font-semibold text-sidebar-primary" : "bg-primary/10 font-semibold text-primary"}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(item.title)}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </>
    );
  }

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
          title={t("Open navigation")}
        >
          <Menu className="h-5 w-5" />
        </button>
        {!collapsed && (
          <span className="font-semibold text-sm text-sidebar-primary-foreground truncate">
            CleannerManager
          </span>
        )}
      </div>

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
            {!collapsed && <span className="truncate">{t(item.title)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border shrink-0">
        <div className="py-2">
          <NavLink
            to="/settings"
            className={cn(
              "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0"
            )}
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{t("Settings")}</span>}
          </NavLink>

          <Popover open={notifOpen} onOpenChange={(open) => { setNotifOpen(open); if (open) fetchNotifications(); }}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-[calc(100%-1rem)]",
                  collapsed && "justify-center px-0"
                )}
              >
                <div className="relative shrink-0">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                {!collapsed && <span className="truncate">{t("Notifications")}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-80 p-0 max-h-96 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">{t("Notifications")}</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                    {t("Mark all read")}
                  </button>
                )}
              </div>
              <div className="overflow-y-auto max-h-72">
                {notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t("No notifications")}</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={cn(
                        "w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors",
                        !n.read && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-line">{n.body}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(n.created_at, "MMM d, HH:mm")}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

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
                  {t(role === "host" ? "Host" : "Cleaner")}
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
            {!collapsed && <span>{t("Sign Out")}</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
