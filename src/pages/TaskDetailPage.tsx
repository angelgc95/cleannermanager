import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ArrowLeft, ClipboardList, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [task, setTask] = useState<any>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!id) return;
    supabase
      .from("cleaning_tasks")
      .select("*, properties(name), rooms(name)")
      .eq("id", id)
      .single()
      .then(({ data }) => setTask(data));
  }, [id]);

  const cancelTask = async () => {
    if (!id || !cancelReason.trim()) return;
    await supabase
      .from("cleaning_tasks")
      .update({ status: "CANCELLED" as const, notes: cancelReason.trim() })
      .eq("id", id);
    setTask((prev: any) => ({ ...prev, status: "CANCELLED", notes: cancelReason.trim() }));
    setCancelOpen(false);
    setCancelReason("");
    toast({ title: "Task cancelled" });
  };

  if (!task) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={`${task.properties?.name || "Listing"} — ${task.rooms?.name || "All rooms"}`}
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
              <CardTitle className="text-lg">Event Details</CardTitle>
              <StatusBadge status={task.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">Nights</p>
                <p className="font-medium">{task.nights_to_show ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Guests</p>
                <p className="font-medium">{task.guests_to_show ?? "N/A"}</p>
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
          {(task.status === "TODO" || task.status === "IN_PROGRESS") && (
            <Button onClick={() => navigate(`/tasks/${id}/checklist`)} className="gap-2" size="lg">
              <ClipboardList className="h-4 w-4" /> Checklist
            </Button>
          )}
          {task.status !== "CANCELLED" && task.status !== "DONE" && (
            <Button variant="outline" onClick={() => setCancelOpen(true)} className="gap-2">
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this cleaning?</DialogTitle>
            <DialogDescription>Please provide a reason for cancelling.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for cancellation…"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Go back
            </Button>
            <Button variant="destructive" disabled={!cancelReason.trim()} onClick={cancelTask}>
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
