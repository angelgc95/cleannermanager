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
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [stats, setStats] = useState({ hoursThisWeek: 0, openMaintenance: 0, missingItems: 0 });

  useEffect(() => {
    const fetchData = async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: tasks } = await supabase
        .from("cleaning_tasks")
        .select("*, listings(name)")
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", `${today}T23:59:59`)
        .order("start_at");

      setTodayTasks(tasks || []);

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

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of today's activity" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Cleanings" value={todayTasks.length} icon={CalendarDays} />
          <StatCard title="Hours This Week" value={stats.hoursThisWeek} icon={Clock} />
          <StatCard title="Open Maintenance" value={stats.openMaintenance} icon={Wrench} />
          <StatCard title="Missing Items" value={stats.missingItems} icon={ShoppingCart} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Cleaning Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No cleaning tasks scheduled for today.</p>
            ) : (
              <div className="space-y-3">
                {todayTasks.map((task: any) => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {task.listings?.name || "Listing"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.start_at ? format(new Date(task.start_at), "HH:mm") : "—"} – {task.end_at ? format(new Date(task.end_at), "HH:mm") : "—"}
                        {task.nights_to_show != null && ` · ${task.nights_to_show} nights`}
                        {task.guests_to_show != null ? ` · ${task.guests_to_show} guests` : ""}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
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
