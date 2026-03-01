import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ArrowLeft, ClipboardList, XCircle, Clock, ShoppingCart, Camera, StickyNote, UserPlus, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EventInlineEdit } from "@/components/admin/EventInlineEdit";
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
  const [event, setEvent] = useState<any>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [checklistRun, setChecklistRun] = useState<any>(null);
  const [runPhotos, setRunPhotos] = useState<any[]>([]);
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const [runShoppingItems, setRunShoppingItems] = useState<any[]>([]);

  const [cleaners, setCleaners] = useState<any[]>([]);
  const [assigningCleaner, setAssigningCleaner] = useState<string>("");

  const isAdmin = role === "host";

  const details = event?.event_details_json || {};

  useEffect(() => {
    if (!id) return;
    supabase
      .from("cleaning_events")
      .select("*, listings(name)")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setEvent(data);
        if (data?.assigned_cleaner_id) {
          setAssigningCleaner(data.assigned_cleaner_id);
        }
        // Check if event has a template
        if (data?.checklist_template_id) {
          setHasTemplate(true);
        } else if (data?.listing_id) {
          // Fallback: check listing's default template
          supabase
            .from("checklist_templates")
            .select("id")
            .eq("listing_id", data.listing_id)
            .eq("active", true)
            .limit(1)
            .then(({ data: tpls }) => {
              setHasTemplate(!!(tpls && tpls.length > 0));
            });
        } else {
          setHasTemplate(false);
        }
      });
  }, [id]);

  useEffect(() => {
    if (!isAdmin || !event || !hostId) return;

    const loadCleaners = async () => {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("cleaner_user_id, listing_id")
        .eq("host_user_id", hostId);
      if (!assignments) return;
      const cleanerIds = [...new Set(assignments.map(a => a.cleaner_user_id))];
      if (cleanerIds.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", cleanerIds);
      if (!profiles) return;

      setCleaners(profiles);

      if (!event.assigned_cleaner_id && event.listing_id) {
        const listingAssignment = assignments.find(a => a.listing_id === event.listing_id);
        if (listingAssignment) {
          setAssigningCleaner(listingAssignment.cleaner_user_id);
          await supabase
            .from("cleaning_events")
            .update({ assigned_cleaner_id: listingAssignment.cleaner_user_id })
            .eq("id", event.id);
          setEvent((prev: any) => ({ ...prev, assigned_cleaner_id: listingAssignment.cleaner_user_id }));
        }
      }
    };
    loadCleaners();

    if (event.checklist_run_id) {
      const loadRunSummary = async () => {
        const { data: run } = await supabase
          .from("checklist_runs")
          .select("*")
          .eq("id", event.checklist_run_id)
          .single();
        setChecklistRun(run);

        const { data: photos } = await supabase
          .from("checklist_photos")
          .select("photo_url, item_id")
          .eq("run_id", event.checklist_run_id);
        setRunPhotos(photos || []);

        const { data: shopItems } = await supabase
          .from("shopping_list")
          .select("*, products(name)")
          .eq("checklist_run_id", event.checklist_run_id);
        setRunShoppingItems(shopItems || []);
      };
      loadRunSummary();
    }
  }, [isAdmin, event, hostId]);

  const cancelEvent = async () => {
    if (!id || !cancelReason.trim()) return;
    await supabase
      .from("cleaning_events")
      .update({ status: "CANCELLED", notes: cancelReason.trim() })
      .eq("id", id);
    setEvent((prev: any) => ({ ...prev, status: "CANCELLED", notes: cancelReason.trim() }));
    setCancelOpen(false);
    setCancelReason("");
    toast({ title: "Event cancelled" });
  };

  const handleAssignCleaner = async (userId: string) => {
    if (!id) return;
    setAssigningCleaner(userId);
    const { error } = await supabase
      .from("cleaning_events")
      .update({ assigned_cleaner_id: userId || null })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEvent((prev: any) => ({ ...prev, assigned_cleaner_id: userId || null }));
      toast({ title: "Cleaner assigned" });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    const { error } = await supabase
      .from("cleaning_events")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEvent((prev: any) => ({ ...prev, status: newStatus }));
      toast({ title: `Status updated to ${newStatus}` });
    }
  };

  if (!event) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader
        title={`${event.listings?.name || "Listing"}`}
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
              <StatusBadge status={event.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">Nights</p>
                <p className="font-medium">{details.nights ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Guests</p>
                <p className="font-medium">{details.guests ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Reference</p>
                <p className="font-medium font-mono text-xs">{event.reference || "—"}</p>
              </div>
            </div>
            {event.notes && (
              <div>
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium">{event.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Manage Event
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
                  <Select value={event.status} onValueChange={handleStatusChange}>
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

        {isAdmin && (
          <EventInlineEdit event={event} onUpdated={(updated) => setEvent(updated)} />
        )}

        {isAdmin && checklistRun && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Checklist Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Listing</p>
                  <p className="font-medium">{event.listings?.name || "N/A"}</p>
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

        {hasTemplate === false && (event.status === "TODO" || event.status === "IN_PROGRESS") && (
          <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Action Required: No checklist template assigned</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  {isAdmin
                    ? "Go to Checklists → Manage Templates to create and assign a template to this listing."
                    : "Ask your host to assign a checklist template to this listing."}
                </p>
                {isAdmin && (
                  <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => navigate("/tasks")}>
                    <ClipboardList className="h-3.5 w-3.5" /> Manage Templates
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 flex-wrap">
          {(event.status === "TODO" || event.status === "IN_PROGRESS") && (
            <Button
              onClick={() => navigate(`/events/${id}/checklist`)}
              className="gap-2"
              size="lg"
              disabled={hasTemplate === false}
            >
              <ClipboardList className="h-4 w-4" /> Start Cleaning Checklist
            </Button>
          )}
          {event.status !== "CANCELLED" && event.status !== "DONE" && (
            <Button variant="outline" onClick={() => setCancelOpen(true)} className="gap-2">
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this cleaning event?</DialogTitle>
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
            <Button variant="destructive" disabled={!cancelReason.trim()} onClick={cancelEvent}>
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
