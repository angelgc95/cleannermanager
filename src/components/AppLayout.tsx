import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";

export function AppLayout() {
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const hideMobileBottomNav = /^\/events\/[^/]+\/checklist$/.test(pathname);
  const useSharedAppShell = role === "cleaner" || role === "host";

  return (
    <div className={cn("flex min-h-[100svh] w-full bg-background", useSharedAppShell && "cleaner-theme")}>
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
    </div>
  );
}
