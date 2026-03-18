import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/LanguageProvider";
import { NotificationBell } from "./NotificationBell";

export function AppLayout() {
  const { role, user } = useAuth();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { t, formatDate } = useI18n();
  const hideMobileBottomNav = /^\/events\/[^/]+\/checklist$/.test(pathname);
  const isCleaner = role === "cleaner";
  const isHostDesktop = role === "host" && !isMobile;
  const displayName = user?.email?.split("@")[0] || t("User");

  return (
    <div
      className={cn(
        "flex min-h-[100svh] w-full bg-background",
        isCleaner && "cleaner-theme",
        isHostDesktop && "bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_30%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.45))]"
      )}
    >
      {isHostDesktop ? (
        <div className="flex w-full gap-4 p-4">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-border/70 bg-background/88 shadow-[0_24px_80px_-40px_hsl(var(--foreground)/0.35)] backdrop-blur">
            <div className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
              <div className="flex h-16 items-center justify-between px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t("Operations Console")}
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">CleannerManager</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(new Date(), "PPP")}</p>
                  </div>
                  <NotificationBell />
                </div>
              </div>
            </div>
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
        </div>
      ) : (
        <>
          <AppSidebar />
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col overflow-auto",
              isMobile && "pt-14",
              isMobile && !hideMobileBottomNav && "pb-24",
            )}
          >
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
        </>
      )}
    </div>
  );
}
