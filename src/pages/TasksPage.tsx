import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfDay } from "date-fns";

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(name), rooms(name)")
        .order("start_at", { ascending: true })
        .limit(200);
      setTasks(data || []);
    };
    fetch();
  }, []);

  const { activeTasks, completedTasks } = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const sevenDaysAgo = subDays(today, 7);

    const active: any[] = [];
    const completed: any[] = [];

    for (const task of tasks) {
      const taskDate = task.start_at ? new Date(task.start_at) : null;

      if (task.status === "DONE") {
        // Done tasks older than 7 days go to completed section
        if (taskDate && taskDate < sevenDaysAgo) {
          completed.push(task);
        } else {
          // Done within last 7 days stays in active view
          active.push(task);
        }
      } else if (task.status === "CANCELLED") {
        // Cancelled older than 7 days: skip entirely
        if (taskDate && taskDate >= sevenDaysAgo) {
          active.push(task);
        }
      } else {
        // TODO / IN_PROGRESS: show if >= 7 days ago or future
        if (!taskDate || taskDate >= sevenDaysAgo) {
          active.push(task);
        }
      }
    }

    // Active sorted earliest first (already sorted by query)
    // Completed sorted most recent first
    completed.sort((a, b) => {
      const da = a.start_at ? new Date(a.start_at).getTime() : 0;
      const db = b.start_at ? new Date(b.start_at).getTime() : 0;
      return db - da;
    });

    return { activeTasks: active, completedTasks: completed };
  }, [tasks]);

  const TaskCard = ({ task }: { task: any }) => (
    <Card
      key={task.id}
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/tasks/${task.id}`)}
    >
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {task.properties?.name || "Listing"} — {task.rooms?.name || "All"}
          </p>
          <p className="text-xs text-muted-foreground">
            {task.start_at ? format(new Date(task.start_at), "MMM d, HH:mm") : "No date"}
            {task.end_at ? ` – ${format(new Date(task.end_at), "HH:mm")}` : ""}
            {task.nights_to_show != null && ` · ${task.nights_to_show}N`}
            {task.guests_to_show != null ? ` · ${task.guests_to_show}G` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.source === "AUTO" && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">Auto</span>
          )}
          <StatusBadge status={task.status} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Checklists"
        description="Cleaning checklists for each scheduled listing task"
      />
      <div className="p-6 space-y-6">
        {/* Active / Upcoming */}
        <div className="space-y-2">
          {activeTasks.length === 0 && completedTasks.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No scheduled cleanings yet. Tasks are created automatically from bookings.</p>
          )}
          {activeTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>

        {/* Completed (older than 7 days) */}
        {completedTasks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">Completed</h3>
            {completedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
