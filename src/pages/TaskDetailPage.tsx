import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ArrowLeft, ClipboardList, XCircle, Clock, ShoppingCart, Camera, StickyNote, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TaskInlineEdit } from "@/components/admin/TaskInlineEdit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
  const { user, role, hostId } = useAuth();
  const { toast } = useToast();
  const [task, setTask] = useState<any>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Admin: checklist summary
  const [checklistRun, setChecklistRun] = useState<any>(null);
  const [runPhotos, setRunPhotos] = useState<any[]>([]);
  const [runShoppingItems, setRunShoppingItems] = useState<any[]>([]);

  // Admin: assign cleaner
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [assigningCleaner, setAssigningCleaner] = useState<string>("");

  const isAdmin = role === "host";

  useEffect(() => {
    if (!id) return;
    supabase
      .from("cleaning_tasks")
      .select("*, listings(name)")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setTask(data);
        if (data?.assigned_cleaner_user_id) {
          setAssigningCleaner(data.assigned_cleaner_user_id);
        }
      });
  }, [id]);

  // Load admin data: checklist summary, cleaners list
  useEffect(() => {
    if (!isAdmin || !task || !hostId) return;

    // Load cleaners for assignment
    const loadCleaners = async () => {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("cleaner_user_id")
        .eq("host_user_id", hostId);
      if (!assignments) return;
      const cleanerIds = [...new Set(assignments.map(a => a.cleaner_user_id))];
      if (cleanerIds.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", cleanerIds);
      if (!profiles) return;

      if (profiles) setCleaners(profiles);
    };
    loadCleaners();

    // Load checklist run summary if task is DONE
    if (task.checklist_run_id) {
      const loadRunSummary = async () => {
        const { data: run } = await supabase
          .from("checklist_runs")
          .select("*")
          .eq("id", task.checklist_run_id)
          .single();
        setChecklistRun(run);

        // Load photos
        const { data: photos } = await supabase
          .from("checklist_photos")
          .select("photo_url, item_id")
          .eq("run_id", task.checklist_run_id);
        setRunPhotos(photos || []);

        // Load shopping items from this run
        const { data: shopItems } = await supabase
          .from("shopping_list")
          .select("*, products(name)")
          .eq("checklist_run_id", task.checklist_run_id);
        setRunShoppingItems(shopItems || []);
      };
      loadRunSummary();
    }
  }, [isAdmin, task, hostId]);

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

  const handleAssignCleaner = async (userId: string) => {
    if (!id) return;
    setAssigningCleaner(userId);
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ assigned_cleaner_user_id: userId || null })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTask((prev: any) => ({ ...prev, assigned_cleaner_user_id: userId || null }));
      toast({ title: "Cleaner assigned" });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ status: newStatus as any })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTask((prev: any) => ({ ...prev, status: newStatus }));
      toast({ title: `Status updated to ${newStatus}` });
    }
  };

  if (!task) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={`${task.listings?.name || "Listing"}`}
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
            {task.reference && (
              <div>
                <p className="text-muted-foreground">Reference</p>
                <p className="font-medium font-mono text-xs">{task.reference}</p>
              </div>
            )}
            {task.notes && (
              <div>
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium">{task.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin: Assign Cleaner + Change Status */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Manage Task
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Assign Cleaner</Label>
                  <Select value={assigningCleaner} onValueChange={handleAssignCleaner}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select cleaner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cleaners.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={task.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODO">To-do</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin: Inline Edit */}
        {isAdmin && (
          <TaskInlineEdit task={task} onUpdated={(updated) => setTask(updated)} />
        )}

        {/* Admin: Checklist Summary (when checklist run exists) */}
        {isAdmin && checklistRun && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Checklist Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Listing</p>
                  <p className="font-medium">{task.listings?.name || "N/A"}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">
                      {checklistRun.duration_minutes
                        ? `${Math.floor(checklistRun.duration_minutes / 60)}h ${checklistRun.duration_minutes % 60}m`
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {checklistRun.overall_notes && (
                <div className="flex items-start gap-1.5">
                  <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-muted-foreground">Notes</p>
                    <p className="font-medium">{checklistRun.overall_notes}</p>
                  </div>
                </div>
              )}

              {runShoppingItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    <p className="text-muted-foreground font-medium">Shopping List ({runShoppingItems.length})</p>
                  </div>
                  <div className="space-y-1 pl-6">
                    {runShoppingItems.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{item.products?.name || "Unknown"}</span>
                        <span className="text-muted-foreground">×{item.quantity_needed}</span>
                        {item.note && <span className="text-xs text-muted-foreground">— {item.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {runPhotos.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <p className="text-muted-foreground font-medium">Photos ({runPhotos.length})</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {runPhotos.map((photo: any, idx: number) => (
                      <a key={idx} href={photo.photo_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={photo.photo_url}
                          alt=""
                          className="h-20 w-20 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {(task.status === "TODO" || task.status === "IN_PROGRESS") && (
            <Button onClick={() => navigate(`/tasks/${id}/checklist`)} className="gap-2" size="lg">
              <ClipboardList className="h-4 w-4" /> Start Cleaning Checklist
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
