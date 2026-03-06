import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/field", label: "Today" },
  { to: "/field/calendar", label: "Calendar" },
  { to: "/field/checklist", label: "Checklist" },
  { to: "/field/extras", label: "Extras" },
  { to: "/field/guides", label: "Guides" },
];

export default function FieldLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <div className="px-4 py-4">
        <Outlet />
      </div>
      <nav className="fixed bottom-0 left-0 right-0 grid grid-cols-5 border-t border-border bg-card">
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
