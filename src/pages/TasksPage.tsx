import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Settings2 } from "lucide-react";

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "manager";
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

  const { upcomingTasks, completedTasks } = useMemo(() => {
    const upcoming: any[] = [];
    const completed: any[] = [];

    for (const task of tasks) {
      if (task.status === "DONE") {
        completed.push(task);
      } else if (task.status !== "CANCELLED") {
        upcoming.push(task);
      }
    }

    // Upcoming: earliest first (already sorted by query)
    // Completed: most recent first
    completed.sort((a, b) => {
      const da = a.start_at ? new Date(a.start_at).getTime() : 0;
      const db = b.start_at ? new Date(b.start_at).getTime() : 0;
      return db - da;
    });

    return { upcomingTasks: upcoming, completedTasks: completed };
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
        actions={
          isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/settings")} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> Edit Template
            </Button>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="upcoming">
          <TabsList className="w-full">
            <TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-2">
            {upcomingTasks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No upcoming checklists.</p>
            ) : (
              upcomingTasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-2">
            {completedTasks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No completed checklists yet.</p>
            ) : (
              completedTasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
