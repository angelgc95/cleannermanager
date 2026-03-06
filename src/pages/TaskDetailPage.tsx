import { useState, forwardRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ClipboardList, XCircle, Clock, ShoppingCart, Camera, StickyNote, AlertTriangle, CheckCircle2, Loader2, Save, Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { deriveEffectiveStatus } from "@/lib/domain/effectiveStatus";
import { EventDebugPanel } from "@/components/EventDebugPanel";

const TaskDetailPage = forwardRef<HTMLDivElement>(function TaskDetailPage(_props, ref) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role, hostId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [assigningCleaner, setAssigningCleaner] = useState<string>("");

  // Pending edits for explicit save
  const [pendingCleaner, setPendingCleaner] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === "host";

  // Query latest checklist run for effectiveStatus
  const { data: latestRunForStatus = null } = useQuery({
    queryKey: ["event-latest-run", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_runs")
        .select("id, finished_at")
        .eq("cleaning_event_id", id!)
        .order("started_at", { ascending: false })
        .limit(1);
      return data && data.length > 0 ? data[0] : null;
    },
  });

  const { data: event = null } = useQuery({
    queryKey: ["event", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("cleaning_events")
        .select("*, listings(name, timezone)")
        .eq("id", id!)
        .single();
      return data;
    },
  });

  const listingTimezone = event?.listings?.timezone || "UTC";
  const details = event?.event_details_json as Record<string, any> || {};

  // Set assigningCleaner from event when it loads
  if (event?.assigned_cleaner_id && assigningCleaner !== event.assigned_cleaner_id && pendingCleaner === null) {
    setAssigningCleaner(event.assigned_cleaner_id);
  }

  // Template name query
  const { data: templateName = null } = useQuery({
    queryKey: ["event-template", event?.checklist_template_id, event?.listing_id],
    enabled: !!event,
    queryFn: async () => {
      if (event!.checklist_template_id) {
        const { data: tpl } = await supabase
          .from("checklist_templates")
          .select("name")
          .eq("id", event!.checklist_template_id)
          .single();
        return tpl?.name || "Assigned";
      } else if (event!.listing_id) {
        const { data: tpls } = await supabase
          .from("checklist_templates")
          .select("id, name")
          .eq("listing_id", event!.listing_id)
          .eq("active", true)
          .limit(1);
        return tpls && tpls.length > 0 ? tpls[0].name : null;
      }
      return null;
    },
  });

  // Cleaners query
  const { data: cleanersData } = useQuery({
    queryKey: ["event-cleaners", hostId],
    enabled: isAdmin && !!hostId,
    queryFn: async () => {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("cleaner_user_id, listing_id")
        .eq("host_user_id", hostId!);
      if (!assignments) return { cleaners: [] as any[], assignments: [] as any[] };
      const cleanerIds = [...new Set(assignments.map(a => a.cleaner_user_id))];
      if (cleanerIds.length === 0) return { cleaners: [], assignments };
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", cleanerIds);
      return { cleaners: profiles || [], assignments };
    },
  });
  const cleaners = cleanersData?.cleaners || [];

  // Pre-select default cleaner
  if (cleanersData && event && !event.assigned_cleaner_id && event.listing_id && pendingCleaner === null) {
    const listingAssignment = cleanersData.assignments.find((a: any) => a.listing_id === event.listing_id);
    if (listingAssignment && pendingCleaner === null) {
      setPendingCleaner(listingAssignment.cleaner_user_id);
    }
  }

  // Checklist run summary
  const { data: checklistRun = null } = useQuery({
    queryKey: ["event-checklist-run", event?.checklist_run_id],
    enabled: isAdmin && !!event?.checklist_run_id,
    queryFn: async () => {
      const { data: run } = await supabase
        .from("checklist_runs")
        .select("*")
        .eq("id", event!.checklist_run_id!)
        .single();
      return run;
    },
  });

  const { data: runPhotos = [] } = useQuery({
    queryKey: ["event-run-photos", event?.checklist_run_id],
    enabled: isAdmin && !!event?.checklist_run_id,
    queryFn: async () => {
      const { data: photos } = await supabase
        .from("checklist_photos")
        .select("photo_url, item_id")
        .eq("run_id", event!.checklist_run_id!);
      return await Promise.all(
        (photos || []).map(async (p: any) => {
          if (p.photo_url && !p.photo_url.startsWith("http")) {
            const { data: signed } = await supabase.storage
              .from("checklist-photos")
              .createSignedUrl(p.photo_url, 86400);
            return { ...p, signed_url: signed?.signedUrl || p.photo_url };
          }
          return { ...p, signed_url: p.photo_url };
        })
      );
    },
  });

  const { data: runShoppingItems = [] } = useQuery({
    queryKey: ["event-run-shopping", event?.checklist_run_id],
    enabled: isAdmin && !!event?.checklist_run_id,
    queryFn: async () => {
      const { data: shopItems } = await supabase
        .from("shopping_list")
        .select("*, products(name)")
        .eq("checklist_run_id", event!.checklist_run_id!);
      return shopItems || [];
    },
  });

  const hasPendingChanges = pendingCleaner !== null || pendingStatus !== null;

  const invalidateEvent = () => {
    queryClient.invalidateQueries({ queryKey: ["event", id] });
    queryClient.invalidateQueries({ queryKey: ["event-latest-run", id] });
    queryClient.invalidateQueries({ queryKey: ["event-checklist-run"] });
    queryClient.invalidateQueries({ queryKey: ["event-run-photos"] });
    queryClient.invalidateQueries({ queryKey: ["event-run-shopping"] });
  };

  const cancelEvent = async () => {
    if (!id || !cancelReason.trim()) return;
    await supabase
      .from("cleaning_events")
      .update({ status: "CANCELLED", notes: cancelReason.trim() })
      .eq("id", id);
    invalidateEvent();
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
      if (pendingCleaner !== null) setAssigningCleaner(pendingCleaner);
      setPendingCleaner(null);
      setPendingStatus(null);
      invalidateEvent();
      toast({ title: "Event updated" });
    }
  };

  const handleResetConfirm = async () => {
    if (!id) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-cleaning-event", {
        body: { cleaning_event_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPendingStatus(null);
      setResetOpen(false);
      invalidateEvent();
      toast({ title: "Event reset", description: "Previous checklist has been removed. The event is ready to be redone." });
    } catch (err: any) {
      toast({ title: "Error resetting event", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  if (!event) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const hasTemplate = !!event.checklist_template_id || templateName !== null;

  // Derive effectiveStatus from latest checklist run
   const effectiveStatus = deriveEffectiveStatus(
     event.status,
     latestRunForStatus,
   );

   const statusMismatch = event.status === "IN_PROGRESS" && effectiveStatus === "COMPLETED";

  return (
    <div ref={ref}>
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
              <StatusBadge status={effectiveStatus} />
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
                        onValueChange={(v) => setPendingStatus(v)}
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
                      {effectiveStatus === "COMPLETED" && (
                        <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)} className="gap-1.5 w-full">
                          <AlertTriangle className="h-3.5 w-3.5" /> Reset checklist (Start again)
                        </Button>
                      )}
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
                      <a key={idx} href={photo.signed_url || photo.photo_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={photo.signed_url || photo.photo_url}
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

        {/* === Status Mismatch Warning === */}
        {statusMismatch && (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Status out of sync (completed checklist exists).
            </p>
          </div>
        )}

        {/* Debug Panel (host only) */}
        <EventDebugPanel eventId={id!} />

        {/* === Action Buttons === */}
        <div className="flex gap-2 flex-wrap">
          {!isAdmin && hasTemplate && effectiveStatus === "TODO" && (
            <Button
              onClick={() => navigate(`/events/${id}/checklist`)}
              className="gap-2"
              size="lg"
            >
              <ClipboardList className="h-4 w-4" /> Start Cleaning Checklist
            </Button>
          )}
          {!isAdmin && hasTemplate && effectiveStatus === "IN_PROGRESS" && (
            <Button
              onClick={() => navigate(`/events/${id}/checklist`)}
              className="gap-2"
              size="lg"
            >
              <ClipboardList className="h-4 w-4" /> Continue Cleaning Checklist
            </Button>
          )}
          {!isAdmin && effectiveStatus === "COMPLETED" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">This cleaning event has been completed.</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={async () => {
                  if (!event?.host_user_id || !user) return;
                  const listingName = event.listings?.name || "Unknown listing";
                  const ref = event.reference || id;
                  await supabase.from("in_app_notifications").insert({
                    user_id: event.host_user_id,
                    host_user_id: event.host_user_id,
                    title: "🔄 Reset requested",
                    body: `Cleaner has requested a checklist reset for ${listingName} (ref: ${ref}).`,
                    link: `/events/${id}`,
                  } as any);
                  toast({ title: "Request sent", description: "Your host has been notified." });
                }} className="gap-2">
                  <Bell className="h-4 w-4" /> Request reset from host
                </Button>
              </div>
            </div>
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
});

export default TaskDetailPage;
