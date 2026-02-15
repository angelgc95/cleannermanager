import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(name), rooms(name), profiles:assigned_cleaner_user_id(name)")
        .order("start_at", { ascending: false })
        .limit(50);
      setTasks(data || []);
    };
    fetch();
  }, []);

  return (
    <div>
      <PageHeader
        title="Cleaning Tasks"
        description="All scheduled and manual cleaning tasks"
        actions={
          <Button size="sm" onClick={() => navigate("/tasks/new")}>
            <Plus className="h-4 w-4 mr-1" /> New Task
          </Button>
        }
      />
      <div className="p-6">
        <div className="space-y-2">
          {tasks.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No cleaning tasks yet.</p>
          )}
          {tasks.map((task: any) => (
            <Card
              key={task.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/tasks/${task.id}`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {task.properties?.name} — {task.rooms?.name || "All"}
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
          ))}
        </div>
      </div>
    </div>
  );
}
