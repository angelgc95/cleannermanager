import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ClipboardList, XCircle, Clock, ShoppingCart, Camera, StickyNote, AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [listingTimezone, setListingTimezone] = useState<string>("UTC");

  const [checklistRun, setChecklistRun] = useState<any>(null);
  const [runPhotos, setRunPhotos] = useState<any[]>([]);
  const [runShoppingItems, setRunShoppingItems] = useState<any[]>([]);

  const [cleaners, setCleaners] = useState<any[]>([]);
  const [assigningCleaner, setAssigningCleaner] = useState<string>("");
  const [templateName, setTemplateName] = useState<string | null>(null);

  // Pending edits for explicit save
  const [pendingCleaner, setPendingCleaner] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === "host";
  const details = event?.event_details_json || {};
  const hasPendingChanges = pendingCleaner !== null || pendingStatus !== null;

  useEffect(() => {
    if (!id) return;
    supabase
      .from("cleaning_events")
      .select("*, listings(name, timezone)")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setEvent(data);
        if (data?.listings?.timezone) {
          setListingTimezone(data.listings.timezone);
        }
        if (data?.assigned_cleaner_id) {
          setAssigningCleaner(data.assigned_cleaner_id);
        }
        // Load template name
        if (data?.checklist_template_id) {
          supabase
            .from("checklist_templates")
            .select("name")
            .eq("id", data.checklist_template_id)
            .single()
            .then(({ data: tpl }) => {
              setTemplateName(tpl?.name || "Assigned");
            });
        } else if (data?.listing_id) {
          supabase
            .from("checklist_templates")
            .select("id, name")
            .eq("listing_id", data.listing_id)
            .eq("active", true)
            .limit(1)
            .then(({ data: tpls }) => {
              if (tpls && tpls.length > 0) {
                setTemplateName(tpls[0].name);
              } else {
                setTemplateName(null);
              }
            });
        } else {
          setTemplateName(null);
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

      // Pre-select default cleaner in the dropdown (but don't auto-save to DB)
      if (!event.assigned_cleaner_id && event.listing_id) {
        const listingAssignment = assignments.find(a => a.listing_id === event.listing_id);
        if (listingAssignment) {
          setPendingCleaner(listingAssignment.cleaner_user_id);
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

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const updates: any = {};
    if (pendingCleaner !== null) updates.assigned_cleaner_id = pendingCleaner || null;
    if (pendingStatus !== null) updates.status = pendingStatus;

    const { error } = await supabase
      .from("cleaning_events")
      .update(updates)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEvent((prev: any) => ({ ...prev, ...updates }));
      if (pendingCleaner !== null) setAssigningCleaner(pendingCleaner);
      setPendingCleaner(null);
      setPendingStatus(null);
      toast({ title: "Event updated" });
    }
  };

  const handleResetConfirm = async () => {
    if (!id || !event?.checklist_run_id) return;
    setResetting(true);
    try {
      const runId = event.checklist_run_id;

      // Delete related data in order: photos, responses, shopping items, log hours, then the run itself
      await supabase.from("checklist_photos").delete().eq("run_id", runId);
      await supabase.from("checklist_responses").delete().eq("run_id", runId);
      await supabase.from("shopping_list").delete().eq("checklist_run_id", runId);
      await supabase.from("log_hours").delete().eq("checklist_run_id", runId);
      await supabase.from("checklist_runs").delete().eq("id", runId);

      // Reset the event: clear checklist_run_id and set status to TODO
      await supabase
        .from("cleaning_events")
        .update({ checklist_run_id: null, status: "TODO" })
        .eq("id", id);

      setEvent((prev: any) => ({ ...prev, checklist_run_id: null, status: "TODO" }));
      setChecklistRun(null);
      setRunPhotos([]);
      setRunShoppingItems([]);
      setPendingStatus(null);
      setResetOpen(false);
      toast({ title: "Event reset", description: "Previous checklist has been removed. The event is ready to be redone." });
    } catch (err: any) {
      toast({ title: "Error resetting event", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  if (!event) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const hasTemplate = !!event.checklist_template_id || templateName !== null;
  const canStartChecklist = hasTemplate && (event.status === "TODO" || event.status === "IN_PROGRESS");

  return (
    <div>
      <PageHeader
        title={event.listings?.name || "Listing"}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        {/* === UNIFIED CLEANING EVENT CARD === */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Cleaning Event</CardTitle>
              <StatusBadge status={event.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* --- Details Section --- */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Details</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
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
                <div>
                  <p className="text-muted-foreground">Cleaning Window</p>
                  <p className="font-medium text-xs">
                    {event.start_at
                      ? new Date(event.start_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: listingTimezone })
                      : "—"}
                    {" → "}
                    {event.end_at
                      ? new Date(event.end_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: listingTimezone })
                      : "—"}
                  </p>
                </div>
              </div>
              {event.notes && (
                <div className="mt-2 text-sm">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">{event.notes}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* --- Assignment Section --- */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Assignment</p>
              {isAdmin ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Assigned Cleaner</Label>
                      <Select
                        value={pendingCleaner ?? assigningCleaner}
                        onValueChange={(v) => setPendingCleaner(v)}
                      >
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
                      <Select
                        value={pendingStatus ?? event.status}
                        onValueChange={(v) => {
                          // If changing to TODO from IN_PROGRESS/DONE and there's a checklist run, show reset dialog
                          const currentStatus = pendingStatus ?? event.status;
                          if (v === "TODO" && (currentStatus === "IN_PROGRESS" || currentStatus === "DONE") && event.checklist_run_id) {
                            setResetOpen(true);
                          } else {
                            setPendingStatus(v);
                          }
                        }}
                      >
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
                  {hasPendingChanges && (
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Changes
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-sm">
                  <p className="text-muted-foreground">Assigned Cleaner</p>
                  <p className="font-medium">
                    {assigningCleaner
                      ? cleaners.find(c => c.user_id === assigningCleaner)?.name || "Assigned"
                      : "Unassigned"}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* --- Checklist Section --- */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Checklist</p>
              {hasTemplate ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="font-medium">{templateName || "Template"}</span>
                  <span className="text-muted-foreground">— Assigned</span>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No checklist template assigned</p>
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
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* === CHECKLIST RUN SUMMARY (admin only, if completed) === */}
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

        {/* === Action Buttons === */}
        <div className="flex gap-2 flex-wrap">
          {!isAdmin && canStartChecklist && (
            <Button
              onClick={() => navigate(`/events/${id}/checklist`)}
              className="gap-2"
              size="lg"
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

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reset this cleaning event?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the previous checklist run, including all responses, photos, shopping items, and logged hours associated with it. The event will be set back to "To-do" so the cleaner can redo it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetConfirm} disabled={resetting} className="gap-1.5">
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Reset & Remove Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
