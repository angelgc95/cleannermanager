import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function AppLayout() {
  const { role } = useAuth();
  return (
    <div className={cn("flex min-h-screen w-full bg-background", role === "cleaner" && "cleaner-theme")}>
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}