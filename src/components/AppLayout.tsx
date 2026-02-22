import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function AppLayout() {
  const { role } = useAuth();
  return (
    <div className={cn("flex min-h-screen w-full bg-background", role === "cleaner" && "cleaner-theme")}>
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="flex items-center justify-end px-4 h-14 border-b border-border bg-card shrink-0">
          <NotificationBell />
        </div>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
