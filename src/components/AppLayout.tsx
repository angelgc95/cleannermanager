import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/LanguageProvider";

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
        isHostDesktop && "bg-slate-100/80"
      )}
    >
      <AppSidebar />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-auto",
          isHostDesktop && "bg-transparent",
          isMobile && "pt-14",
          isMobile && !hideMobileBottomNav && "pb-24",
        )}
      >
        {isHostDesktop && (
          <div className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t("Operations Console")}
                </p>
                <p className="truncate text-sm font-semibold text-foreground">CleannerManager</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{formatDate(new Date(), "PPP")}</p>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
