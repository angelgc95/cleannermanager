import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type EventRow = {
  id: string;
  organization_id: string;
  listing_id: string;
  assigned_cleaner_id: string | null;
  status: string;
};

type RunRow = {
  id: string;
  template_id: string;
  status: string;
  finished_at: string | null;
};

type TemplateItem = {
  id: string;
  label: string;
  required: boolean;
  photo_required: boolean;
  fail_requires_comment: boolean;
  sort_order: number;
};

type ResponseState = {
  passed: boolean | null;
  comment: string;
};

export default function ChecklistWizardPage() {
  const { eventId } = useParams();
  const { user } = useAuth();

  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [runRow, setRunRow] = useState<RunRow | null>(null);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [photosByItem, setPhotosByItem] = useState<Record<string, string[]>>({});
  const [photoInput, setPhotoInput] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!eventId || !user?.id) return;

    const { data: eventData } = await db
      .from("v1_events")
      .select("id, organization_id, listing_id, assigned_cleaner_id, status")
      .eq("id", eventId)
      .eq("assigned_cleaner_id", user.id)
      .maybeSingle();

    if (!eventData) {
      setEventRow(null);
      return;
    }

    setEventRow(eventData as EventRow);

    let runData = (await db
      .from("v1_checklist_runs")
      .select("id, template_id, status, finished_at")
      .eq("event_id", eventId)
      .maybeSingle()).data as RunRow | null;

    if (!runData) {
      const { data: template } = await db
        .from("v1_checklist_templates")
        .select("id")
        .eq("organization_id", eventData.organization_id)
        .eq("listing_id", eventData.listing_id)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!template?.id) {
        setMessage("No active checklist template configured for this listing.");
        return;
      }

      const { data: createdRun } = await db
        .from("v1_checklist_runs")
        .insert({
          organization_id: eventData.organization_id,
          event_id: eventData.id,
          template_id: template.id,
          cleaner_id: user.id,
          status: "IN_PROGRESS",
        })
        .select("id, template_id, status, finished_at")
        .single();

      runData = createdRun as RunRow;
      await db.from("v1_events").update({ status: "IN_PROGRESS" }).eq("id", eventData.id);
    }

    setRunRow(runData);

    const [{ data: itemRows }, { data: responseRows }, { data: photoRows }] = await Promise.all([
      db
        .from("v1_checklist_template_items")
        .select("id, label, required, photo_required, fail_requires_comment, sort_order")
        .eq("template_id", runData.template_id)
        .order("sort_order", { ascending: true }),
      db
        .from("v1_checklist_responses")
        .select("item_id, passed, comment")
        .eq("run_id", runData.id),
      db
        .from("v1_checklist_photos")
        .select("item_id, storage_path")
        .eq("run_id", runData.id),
    ]);

    const loadedItems = (itemRows || []) as TemplateItem[];
    setItems(loadedItems);

    const nextResponses: Record<string, ResponseState> = {};
    for (const item of loadedItems) {
      nextResponses[item.id] = { passed: null, comment: "" };
    }
    for (const row of responseRows || []) {
      nextResponses[row.item_id] = {
        passed: row.passed,
        comment: row.comment || "",
      };
    }
    setResponses(nextResponses);

    const nextPhotos: Record<string, string[]> = {};
    for (const photo of photoRows || []) {
      if (!photo.item_id) continue;
      const list = nextPhotos[photo.item_id] || [];
      list.push(photo.storage_path);
      nextPhotos[photo.item_id] = list;
    }
    setPhotosByItem(nextPhotos);
  };

  useEffect(() => {
    load();
  }, [eventId, user?.id]);

  const qaReviewNeeded = useMemo(() => {
    return items.some((item) => responses[item.id]?.passed === false);
  }, [items, responses]);

  const canFinish = useMemo(() => {
    for (const item of items) {
      const response = responses[item.id];
      if (!response) return false;

      if (item.required && response.passed === null) return false;
      if (item.photo_required && (photosByItem[item.id] || []).length === 0) return false;
      if (response.passed === false && item.fail_requires_comment && !response.comment.trim()) return false;
    }
    return true;
  }, [items, responses, photosByItem]);

  const saveResponses = async () => {
    if (!runRow || !eventRow) return;
    setLoading(true);

    for (const item of items) {
      const response = responses[item.id] || { passed: null, comment: "" };
      await db.from("v1_checklist_responses").upsert({
        organization_id: eventRow.organization_id,
        run_id: runRow.id,
        item_id: item.id,
        passed: response.passed,
        comment: response.comment || null,
      }, { onConflict: "run_id,item_id" });
    }

    setLoading(false);
    setMessage("Checklist progress saved.");
  };

  const addPhotoPath = async (itemId: string) => {
    if (!runRow || !eventRow) return;
    const value = (photoInput[itemId] || "").trim();
    if (!value) return;

    await db.from("v1_checklist_photos").insert({
      organization_id: eventRow.organization_id,
      run_id: runRow.id,
      item_id: itemId,
      storage_path: value,
    });

    const list = photosByItem[itemId] || [];
    setPhotosByItem({ ...photosByItem, [itemId]: [...list, value] });
    setPhotoInput({ ...photoInput, [itemId]: "" });
  };

  const finishRun = async () => {
    if (!runRow || !eventRow) return;
    if (!canFinish) {
      setMessage("Checklist is incomplete. Complete required answers, required photos, and fail comments.");
      return;
    }

    await saveResponses();

    const nextStatus = qaReviewNeeded ? "QA_REVIEW" : "COMPLETED";
    await db.from("v1_checklist_runs").update({
      status: nextStatus,
      finished_at: new Date().toISOString(),
    }).eq("id", runRow.id);

    await db.from("v1_events").update({
      status: nextStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
    }).eq("id", eventRow.id);

    setMessage(nextStatus === "COMPLETED" ? "Checklist completed." : "Checklist submitted for QA review.");
    await load();
  };

  if (!eventRow) {
    return <p className="text-sm text-muted-foreground">Event not found or not assigned.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Checklist Wizard</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Event: {eventRow.id}</p>
          <p>Status: {runRow?.status || "NOT_STARTED"}</p>
          <p className="text-xs text-muted-foreground">Required items must be answered. Photo-required items need at least one storage path. Failed items require comments.</p>
        </CardContent>
      </Card>

      {items.map((item) => {
        const response = responses[item.id] || { passed: null, comment: "" };
        const photos = photosByItem[item.id] || [];

        return (
          <Card key={item.id}>
            <CardHeader><CardTitle className="text-base">{item.label}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={response.passed === true ? "default" : "outline"}
                  onClick={() => setResponses({ ...responses, [item.id]: { ...response, passed: true } })}
                >
                  Pass
                </Button>
                <Button
                  type="button"
                  variant={response.passed === false ? "destructive" : "outline"}
                  onClick={() => setResponses({ ...responses, [item.id]: { ...response, passed: false } })}
                >
                  Fail
                </Button>
                <Button
                  type="button"
                  variant={response.passed === null ? "secondary" : "outline"}
                  onClick={() => setResponses({ ...responses, [item.id]: { ...response, passed: null } })}
                >
                  Clear
                </Button>
              </div>

              <div className="space-y-1">
                <Label>Comment {item.fail_requires_comment ? "(required on fail)" : "(optional)"}</Label>
                <Textarea
                  value={response.comment}
                  onChange={(event) => setResponses({ ...responses, [item.id]: { ...response, comment: event.target.value } })}
                />
              </div>

              <div className="space-y-1">
                <Label>Photo storage path {item.photo_required ? "(required)" : "(optional)"}</Label>
                <div className="flex gap-2">
                  <Input
                    value={photoInput[item.id] || ""}
                    onChange={(event) => setPhotoInput({ ...photoInput, [item.id]: event.target.value })}
                    placeholder="org/{org-id}/run/{run-id}/photo.jpg"
                  />
                  <Button type="button" variant="outline" onClick={() => addPhotoPath(item.id)}>Add</Button>
                </div>
                {photos.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {photos.map((path, idx) => <li key={`${item.id}-${idx}`}>{path}</li>)}
                  </ul>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {item.required ? "Required" : "Optional"} · {item.photo_required ? "Photo required" : "No photo requirement"}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex gap-2">
        <Button onClick={saveResponses} disabled={loading}>Save Progress</Button>
        <Button onClick={finishRun} disabled={loading || !runRow}>Finish Checklist</Button>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
