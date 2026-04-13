import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";
import { isNativeCleanerApp } from "@/lib/appVariant";

export function AppLayout() {
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const hideMobileBottomNav = /^\/events\/[^/]+\/checklist$/.test(pathname);
  const themeClass = isNativeCleanerApp() ? "cleaner-theme" : role === "cleaner" ? "cleaner-theme" : role === "host" ? "host-theme" : undefined;

  return (
    <div className={cn("relative isolate flex min-h-[100svh] w-full overflow-hidden bg-background", themeClass)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-28 bottom-0 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      </div>
      <AppSidebar />
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-auto",
          isMobile && "pt-14",
          isMobile && !hideMobileBottomNav && "pb-24",
        )}
      >
        <main className="flex-1 overflow-auto">
          <div className="min-h-full bg-gradient-to-b from-background via-background to-background/90">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
