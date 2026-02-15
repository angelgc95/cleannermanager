import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ArrowLeft, Play, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [task, setTask] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("cleaning_tasks")
      .select("*, properties(name), rooms(name)")
      .eq("id", id)
      .single()
      .then(({ data }) => setTask(data));
  }, [id]);

  const updateStatus = async (status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED") => {
    if (!id) return;
    await supabase.from("cleaning_tasks").update({ status }).eq("id", id);
    setTask((prev: any) => ({ ...prev, status }));
    toast({ title: `Task marked as ${status}` });
  };

  if (!task) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={`${task.properties?.name} — ${task.rooms?.name || "All rooms"}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Task Details</CardTitle>
              <StatusBadge status={task.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">Start</p>
                <p className="font-medium">{task.start_at ? format(new Date(task.start_at), "MMM d, HH:mm") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">End</p>
                <p className="font-medium">{task.end_at ? format(new Date(task.end_at), "HH:mm") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Nights</p>
                <p className="font-medium">{task.nights_to_show ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Guests</p>
                <p className="font-medium">{task.guests_to_show ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium">{task.source}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Locked</p>
                <p className="font-medium">{task.locked ? "Yes" : "No"}</p>
              </div>
            </div>
            {task.notes && (
              <div>
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium">{task.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2 flex-wrap">
          {task.status === "TODO" && (
            <Button onClick={() => updateStatus("IN_PROGRESS")} className="gap-2">
              <Play className="h-4 w-4" /> Start Cleaning
            </Button>
          )}
          {task.status === "IN_PROGRESS" && (
            <Button onClick={() => updateStatus("DONE")} className="gap-2">
              <CheckCircle className="h-4 w-4" /> Mark Done
            </Button>
          )}
          {task.status !== "CANCELLED" && task.status !== "DONE" && (
            <Button variant="outline" onClick={() => updateStatus("CANCELLED")}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
