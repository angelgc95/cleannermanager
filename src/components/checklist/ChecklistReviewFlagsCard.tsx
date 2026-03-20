import { useMemo, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/LanguageProvider";
import { ArrowUpRight, Camera, CheckCircle2, Loader2, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

type AnnotationType = "circle" | "arrow" | "box";

interface RunPhoto {
  id?: string;
  item_id?: string;
  photo_url: string;
  signed_url?: string;
}

interface ChecklistReviewFlagsCardProps {
  eventId: string;
  checklistRunId: string | null;
  hostUserId: string | null;
  cleanerUserId: string | null;
  runPhotos: RunPhoto[];
  isHost: boolean;
  canCreate: boolean;
}

interface ReviewFlag {
  id: string;
  cleaning_event_id: string;
  checklist_run_id: string;
  comment: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

interface ReviewFlagPhoto {
  id: string;
  flag_id: string;
  checklist_photo_id: string;
  annotation_type: AnnotationType | null;
  annotation_x: number | null;
  annotation_y: number | null;
}

interface ReviewRunState {
  review_status: string;
  approved_at: string | null;
}

const EMPTY_REVIEW_FLAGS: ReviewFlag[] = [];
const EMPTY_REVIEW_FLAG_PHOTOS: ReviewFlagPhoto[] = [];

type AnnotationDraft = {
  annotationType: AnnotationType | null;
  x: number | null;
  y: number | null;
};

const statusStyles: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-800 border-amber-200",
  REVIEWED: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const reviewStatusStyles: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-800 border-slate-200",
  FLAGGED: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function AnnotationOverlay({
  annotationType,
  x,
  y,
  className,
}: {
  annotationType: AnnotationType | null;
  x: number | null;
  y: number | null;
  className?: string;
}) {
  if (!annotationType || x === null || y === null) return null;

  const baseStyle = {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
  };

  if (annotationType === "circle") {
    return (
      <div
        className={cn(
          "pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-red-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.04)]",
          className
        )}
        style={baseStyle}
      />
    );
  }

  if (annotationType === "box") {
    return (
      <div
        className={cn(
          "pointer-events-none absolute h-14 w-20 -translate-x-1/2 -translate-y-1/2 rounded-md border-[3px] border-sky-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.04)]",
          className
        )}
        style={baseStyle}
      />
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 p-1.5 text-red-600 shadow-lg",
        className
      )}
      style={baseStyle}
    >
      <ArrowUpRight className="h-5 w-5" />
    </div>
  );
}

export function ChecklistReviewFlagsCard({
  eventId,
  checklistRunId,
  hostUserId,
  cleanerUserId,
  runPhotos,
  isHost,
  canCreate,
}: ChecklistReviewFlagsCardProps) {
  const { toast } = useToast();
  const { formatDateTime, t } = useI18n();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{
    photoUrl: string;
    annotationType: AnnotationType | null;
    x: number | null;
    y: number | null;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Record<string, boolean>>({});
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, AnnotationDraft>>({});
  const [reviewingFlagId, setReviewingFlagId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const photosById = useMemo(
    () =>
      runPhotos.reduce<Record<string, RunPhoto>>((acc, photo) => {
        if (photo.id) acc[photo.id] = photo;
        return acc;
      }, {}),
    [runPhotos]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["checklist-review-flags", eventId, checklistRunId],
    enabled: !!eventId && !!checklistRunId,
    queryFn: async () => {
      const { data: flags, error: flagError } = await supabase
        .from("checklist_review_flags")
        .select("*")
        .eq("cleaning_event_id", eventId)
        .eq("checklist_run_id", checklistRunId!)
        .order("created_at", { ascending: false });
      if (flagError) throw flagError;

      const { data: runState, error: runStateError } = await supabase
        .from("checklist_runs")
        .select("review_status, approved_at")
        .eq("id", checklistRunId!)
        .single();
      if (runStateError) throw runStateError;

      const flagIds = (flags || []).map((flag) => flag.id);
      if (flagIds.length === 0) {
        return {
          flags: [] as ReviewFlag[],
          flagPhotos: [] as ReviewFlagPhoto[],
          runState: runState as ReviewRunState,
        };
      }

      const { data: flagPhotos, error: photoError } = await supabase
        .from("checklist_review_flag_photos")
        .select("*")
        .in("flag_id", flagIds);
      if (photoError) throw photoError;

      return {
        flags: (flags as ReviewFlag[]) || [],
        flagPhotos: (flagPhotos as ReviewFlagPhoto[]) || [],
        runState: runState as ReviewRunState,
      };
    },
  });

  const flags = data?.flags ?? EMPTY_REVIEW_FLAGS;
  const flagPhotos = data?.flagPhotos ?? EMPTY_REVIEW_FLAG_PHOTOS;
  const runState = data?.runState ?? { review_status: "PENDING", approved_at: null };
  const openFlagsCount = flags.filter((flag) => flag.status === "OPEN").length;

  const flagPhotosByFlagId = useMemo(
    () =>
      flagPhotos.reduce<Record<string, ReviewFlagPhoto[]>>((acc, photo) => {
        if (!acc[photo.flag_id]) acc[photo.flag_id] = [];
        acc[photo.flag_id].push(photo);
        return acc;
      }, {}),
    [flagPhotos]
  );

  const resetCreateState = () => {
    setComment("");
    setSelectedPhotoIds({});
    setAnnotationDrafts({});
    setCreateOpen(false);
  };

  const togglePhoto = (photoId: string, checked: boolean) => {
    setSelectedPhotoIds((prev) => ({ ...prev, [photoId]: checked }));
    if (!checked) {
      setAnnotationDrafts((prev) => {
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
    }
  };

  const setAnnotationType = (photoId: string, annotationType: AnnotationType | null) => {
    setAnnotationDrafts((prev) => ({
      ...prev,
      [photoId]: {
        annotationType,
        x: prev[photoId]?.x ?? null,
        y: prev[photoId]?.y ?? null,
      },
    }));
  };

  const placeAnnotation = (photoId: string, event: MouseEvent<HTMLButtonElement>) => {
    const currentDraft = annotationDrafts[photoId];
    if (!currentDraft?.annotationType) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    setAnnotationDrafts((prev) => ({
      ...prev,
      [photoId]: { ...prev[photoId], x, y },
    }));
  };

  const createFlag = async () => {
    if (!checklistRunId || !hostUserId || !cleanerUserId || !comment.trim()) return;
    setSubmitting(true);
    try {
      const { data: createdFlag, error: flagError } = await supabase
        .from("checklist_review_flags")
        .insert({
          cleaning_event_id: eventId,
          checklist_run_id: checklistRunId,
          host_user_id: hostUserId,
          cleaner_user_id: cleanerUserId,
          comment: comment.trim(),
        })
        .select("id")
        .single();

      if (flagError) throw flagError;

      const selectedIds = Object.entries(selectedPhotoIds)
        .filter(([, checked]) => checked)
        .map(([photoId]) => photoId);

      if (selectedIds.length > 0) {
        const payload = selectedIds.map((photoId) => ({
          flag_id: createdFlag.id,
          checklist_photo_id: photoId,
          annotation_type: annotationDrafts[photoId]?.annotationType ?? null,
          annotation_x: annotationDrafts[photoId]?.x ?? null,
          annotation_y: annotationDrafts[photoId]?.y ?? null,
        }));

        const { error: photoError } = await supabase
          .from("checklist_review_flag_photos")
          .insert(payload);

        if (photoError) throw photoError;
      }

      await queryClient.invalidateQueries({ queryKey: ["checklist-review-flags", eventId, checklistRunId] });
      toast({
        title: t("Review flag added"),
        description: t("The cleaner has been notified to review it."),
      });
      resetCreateState();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("Please try again.");
      toast({
        title: t("Unable to add review flag"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const markReviewed = async (flagId: string) => {
    setReviewingFlagId(flagId);
    try {
      const { error } = await supabase
        .from("checklist_review_flags")
        .update({ status: "REVIEWED", reviewed_at: new Date().toISOString() })
        .eq("id", flagId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["checklist-review-flags", eventId, checklistRunId] });
      toast({ title: t("Flag reviewed") });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("Please try again.");
      toast({
        title: t("Unable to update flag"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setReviewingFlagId(null);
    }
  };

  const approveChecklist = async () => {
    if (!checklistRunId) return;
    setApproving(true);
    try {
      const { error } = await supabase
        .from("checklist_runs")
        .update({
          review_status: "APPROVED",
          approved_at: new Date().toISOString(),
        })
        .eq("id", checklistRunId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["checklist-review-flags", eventId, checklistRunId] });
      toast({ title: t("Checklist approved") });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("Please try again.");
      toast({
        title: t("Unable to approve checklist"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">{t("Review Flags")}</CardTitle>
            {isHost && canCreate && (
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <MessageSquarePlus className="h-4 w-4" />
                {t("Add flag")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("Submission review")}
              </p>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("border", reviewStatusStyles[runState.review_status] || reviewStatusStyles.PENDING)}
                >
                  {runState.review_status === "APPROVED"
                    ? t("Approved")
                    : runState.review_status === "FLAGGED"
                      ? t("Flagged")
                      : t("Pending review")}
                </Badge>
                {openFlagsCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t("Open flags")}: {openFlagsCount}
                  </span>
                )}
              </div>
              {runState.approved_at && (
                <p className="text-xs text-muted-foreground">
                  {t("Approved at")}:{" "}
                  {formatDateTime(runState.approved_at, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
            </div>

            {isHost && (
              <Button
                size="sm"
                variant={runState.review_status === "APPROVED" ? "secondary" : "default"}
                className="gap-1.5"
                onClick={approveChecklist}
                disabled={approving || openFlagsCount > 0 || runState.review_status === "APPROVED"}
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {runState.review_status === "APPROVED" ? t("Approved") : t("Approve checklist")}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Loading...")}
            </div>
          ) : flags.length === 0 ? (
            <p className="text-muted-foreground">
              {isHost ? t("No review flags yet.") : t("Your host has not requested any review yet.")}
            </p>
          ) : (
            <div className="space-y-4">
              {flags.map((flag, index) => {
                const references = (flagPhotosByFlagId[flag.id] || []).map((reference) => ({
                  ...reference,
                  photo: photosById[reference.checklist_photo_id],
                }));

                return (
                  <div key={flag.id} className="rounded-xl border border-border p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {t("Flag")} #{flags.length - index}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(flag.created_at, { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("border", statusStyles[flag.status] || "")}>
                        {flag.status === "REVIEWED" ? t("Reviewed") : t("Open")}
                      </Badge>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="whitespace-pre-wrap text-sm">{flag.comment}</p>
                    </div>

                    {references.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Camera className="h-4 w-4" />
                          <p className="font-medium">
                            {t("Reference photos")} ({references.length})
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {references.map((reference) => {
                            if (!reference.photo) return null;
                            const url = reference.photo.signed_url || reference.photo.photo_url;
                            return (
                              <button
                                key={reference.id}
                                type="button"
                                onClick={() =>
                                  setSelectedPreview({
                                    photoUrl: url,
                                    annotationType: reference.annotation_type,
                                    x: reference.annotation_x,
                                    y: reference.annotation_y,
                                  })
                                }
                                className="relative overflow-hidden rounded-xl border border-border bg-muted/20"
                              >
                                <img
                                  src={url}
                                  alt={t("Reference photo")}
                                  className="h-32 w-full object-cover"
                                />
                                <AnnotationOverlay
                                  annotationType={reference.annotation_type}
                                  x={reference.annotation_x}
                                  y={reference.annotation_y}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!isHost && flag.status === "OPEN" && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => markReviewed(flag.id)}
                          disabled={reviewingFlagId === flag.id}
                        >
                          {reviewingFlagId === flag.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          {t("Mark as reviewed")}
                        </Button>
                      </div>
                    )}

                    {flag.status === "REVIEWED" && flag.reviewed_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("Reviewed at")}:{" "}
                        {formatDateTime(flag.reviewed_at, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => (!submitting ? setCreateOpen(open) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Add review flag")}</DialogTitle>
            <DialogDescription>
              {t("Add a short note for the cleaner and select any photos you want to use as reference.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review-flag-comment">{t("Comment")}</Label>
              <Textarea
                id="review-flag-comment"
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("What should the cleaner review?")}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">{t("Reference photos")}</p>
              </div>
              {runPhotos.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("No photos available on this submission.")}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {runPhotos.map((photo, index) => {
                    if (!photo.id) return null;
                    const checked = !!selectedPhotoIds[photo.id];
                    const draft = annotationDrafts[photo.id];
                    const url = photo.signed_url || photo.photo_url;

                    return (
                      <div key={photo.id} className={cn("rounded-xl border p-3 space-y-3", checked ? "border-primary" : "border-border")}>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => togglePhoto(photo.id!, value === true)}
                            id={`review-photo-${photo.id}`}
                          />
                          <Label htmlFor={`review-photo-${photo.id}`} className="text-sm">
                            {t("Use photo")} {index + 1}
                          </Label>
                        </div>

                        <button
                          type="button"
                          disabled={!checked}
                          onClick={(event) => placeAnnotation(photo.id!, event)}
                          className={cn(
                            "relative block w-full overflow-hidden rounded-lg border bg-muted/20",
                            checked ? "cursor-crosshair" : "cursor-not-allowed opacity-60"
                          )}
                        >
                          <img src={url} alt={`${t("Submission photo")} ${index + 1}`} className="h-44 w-full object-cover" />
                          <AnnotationOverlay
                            annotationType={draft?.annotationType ?? null}
                            x={draft?.x ?? null}
                            y={draft?.y ?? null}
                          />
                        </button>

                        {checked && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">{t("Marker")}</p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { value: null, label: t("None") },
                                { value: "circle", label: t("Circle") },
                                { value: "arrow", label: t("Arrow") },
                                { value: "box", label: t("Box") },
                              ].map((option) => (
                                <Button
                                  key={option.label}
                                  type="button"
                                  variant={draft?.annotationType === option.value ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setAnnotationType(photo.id!, option.value as AnnotationType | null)}
                                >
                                  {option.label}
                                </Button>
                              ))}
                            </div>
                            {draft?.annotationType && (
                              <p className="text-xs text-muted-foreground">
                                {t("Tap the photo to place the marker.")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetCreateState} disabled={submitting}>
              {t("Cancel")}
            </Button>
            <Button onClick={createFlag} disabled={submitting || !comment.trim()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("Save flag")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPreview} onOpenChange={(open) => !open && setSelectedPreview(null)}>
        <DialogContent className="max-w-4xl border-none bg-black/95 p-2 text-white sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("Reference photo preview")}</DialogTitle>
            <DialogDescription>{t("Expanded reference photo.")}</DialogDescription>
          </DialogHeader>
          {selectedPreview && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg">
                <img
                  src={selectedPreview.photoUrl}
                  alt={t("Reference photo")}
                  className="max-h-[78vh] w-full object-contain"
                />
                <AnnotationOverlay
                  annotationType={selectedPreview.annotationType}
                  x={selectedPreview.x}
                  y={selectedPreview.y}
                  className="sm:scale-125"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
