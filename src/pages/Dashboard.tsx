import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Clock, Wrench, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${color || 'bg-primary/10'}`}>
          <Icon className={`h-5 w-5 ${color ? 'text-card-foreground' : 'text-primary'}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ hoursThisWeek: 0, openMaintenance: 0, missingItems: 0 });

  useEffect(() => {
    const fetchData = async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: events } = await supabase
        .from("cleaning_events")
        .select("*, listings(name)")
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", `${today}T23:59:59`)
        .order("start_at");

      setTodayEvents(events || []);

      const { count: maintenanceCount } = await supabase
        .from("maintenance_tickets")
        .select("*", { count: "exact", head: true })
        .neq("status", "DONE");

      const { count: missingCount } = await supabase
        .from("shopping_list")
        .select("*", { count: "exact", head: true })
        .eq("status", "MISSING");

      setStats({
        hoursThisWeek: 0,
        openMaintenance: maintenanceCount || 0,
        missingItems: missingCount || 0,
      });
    };
    fetchData();
  }, []);

  const details = (ev: any) => ev.event_details_json || {};

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of today's activity" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Cleanings" value={todayEvents.length} icon={CalendarDays} />
          <StatCard title="Hours This Week" value={stats.hoursThisWeek} icon={Clock} />
          <StatCard title="Open Maintenance" value={stats.openMaintenance} icon={Wrench} />
          <StatCard title="Missing Items" value={stats.missingItems} icon={ShoppingCart} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Cleaning Events</CardTitle>
          </CardHeader>
          <CardContent>
            {todayEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No cleaning events scheduled for today.</p>
            ) : (
              <div className="space-y-3">
                {todayEvents.map((ev: any) => (
                  <div
                    key={ev.id}
                    onClick={() => navigate(`/events/${ev.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {ev.listings?.name || "Listing"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ev.start_at ? format(new Date(ev.start_at), "HH:mm") : "—"} – {ev.end_at ? format(new Date(ev.end_at), "HH:mm") : "—"}
                        {details(ev).nights != null && ` · ${details(ev).nights} nights`}
                        {details(ev).guests != null ? ` · ${details(ev).guests} guests` : ""}
                      </p>
                    </div>
                    <StatusBadge status={ev.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
