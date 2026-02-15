import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Top bar with notification bell */}
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
