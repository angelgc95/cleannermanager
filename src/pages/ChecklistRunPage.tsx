import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkLogSection } from "@/components/checklist/WorkLogSection";
import { ShoppingCheckSection } from "@/components/checklist/ShoppingCheckSection";

interface Section {
  id: string;
  title: string;
  sort_order: number;
  items: ChecklistItem[];
}

interface ChecklistItem {
  id: string;
  item_key: string | null;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  help_text: string | null;
}

interface PhotoEntry {
  id?: string;
  url: string;
  uploading?: boolean;
}

interface MissingItem {
  productId: string;
  productName: string;
  quantity: number;
  note: string;
}

const SHOPPING_TAB_ID = "__shopping__";

export default function ChecklistRunPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user, orgId } = useAuth();
  const { toast } = useToast();

  const [task, setTask] = useState<any>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, boolean | null>>({});
  const [photos, setPhotos] = useState<Record<string, PhotoEntry[]>>({});
  const [activeTab, setActiveTab] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [alreadyFinished, setAlreadyFinished] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoItemId, setActivePhotoItemId] = useState<string | null>(null);

  // Work Log state
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [workStart, setWorkStart] = useState(nowTime());
  const [workEnd, setWorkEnd] = useState("");
  const [workNotes, setWorkNotes] = useState("");
  const [workLogError, setWorkLogError] = useState<string | null>(null);

  // Shopping state
  const [shoppingChecked, setShoppingChecked] = useState<boolean | null>(null);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [shoppingError, setShoppingError] = useState<string | null>(null);

  // Load task + template sections + reuse existing run
  useEffect(() => {
    if (!taskId || !user) return;

    const load = async () => {
      const { data: taskData } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(name, timezone), rooms(name, checklist_template_id)")
        .eq("id", taskId)
        .single();
      setTask(taskData);

      // Check if task is already DONE
      if (taskData?.status === "DONE") {
        setAlreadyFinished(true);
        return;
      }

      const templateId = taskData?.rooms?.checklist_template_id || "00000000-0000-0000-0000-000000000001";

      const { data: sectionsData } = await supabase
        .from("checklist_sections")
        .select("id, title, sort_order")
        .eq("template_id", templateId)
        .order("sort_order");

      if (!sectionsData || sectionsData.length === 0) return;

      const sectionIds = sectionsData.map((s) => s.id);
      const { data: itemsData } = await supabase
        .from("checklist_items")
        .select("id, item_key, label, type, required, sort_order, help_text, section_id")
        .in("section_id", sectionIds)
        .order("sort_order");

      const fullSections: Section[] = sectionsData.map((s) => ({
        ...s,
        items: (itemsData || []).filter((i: any) => i.section_id === s.id),
      }));

      setSections(fullSections);
      if (fullSections.length > 0) setActiveTab(fullSections[0].id);

      // Check for existing unfinished run for this task
      const { data: existingRuns } = await supabase
        .from("checklist_runs")
        .select("id")
        .eq("cleaning_task_id", taskId)
        .is("finished_at", null)
        .limit(1);

      if (existingRuns && existingRuns.length > 0) {
        // Reuse existing run
        setRunId(existingRuns[0].id);
      } else {
        // Create new checklist run
        const startedAt = new Date().toISOString();
        const { data: run } = await supabase
          .from("checklist_runs")
          .insert({
            cleaning_task_id: taskId,
            property_id: taskData?.property_id,
            room_id: taskData?.room_id,
            cleaner_user_id: user.id,
            started_at: startedAt,
            org_id: orgId,
          })
          .select("id")
          .single();

        if (run) setRunId(run.id);
      }

      if (taskData?.status === "TODO") {
        await supabase.from("cleaning_tasks").update({ status: "IN_PROGRESS" as const }).eq("id", taskId);
      }
    };

    load();
  }, [taskId, user]);

  const toggleYesNo = (itemId: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: prev[itemId] === true ? null : true,
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !activePhotoItemId || !runId || !user) return;
    const files = Array.from(e.target.files);

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${runId}/${activePhotoItemId}/${crypto.randomUUID()}.${ext}`;

      const tempId = crypto.randomUUID();
      setPhotos((prev) => ({
        ...prev,
        [activePhotoItemId]: [...(prev[activePhotoItemId] || []), { id: tempId, url: "", uploading: true }],
      }));

      const { data, error } = await supabase.storage
        .from("checklist-photos")
        .upload(path, file, { contentType: file.type });

      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        setPhotos((prev) => ({
          ...prev,
          [activePhotoItemId]: (prev[activePhotoItemId] || []).filter((p) => p.id !== tempId),
        }));
        continue;
      }

      const { data: urlData } = supabase.storage.from("checklist-photos").getPublicUrl(data.path);

      await supabase.from("checklist_photos").insert({
        run_id: runId,
        item_id: activePhotoItemId,
        photo_url: urlData.publicUrl,
        sort_order: (photos[activePhotoItemId]?.length || 0),
        org_id: orgId,
      });

      setPhotos((prev) => ({
        ...prev,
        [activePhotoItemId]: (prev[activePhotoItemId] || []).map((p) =>
          p.id === tempId ? { ...p, url: urlData.publicUrl, uploading: false } : p
        ),
      }));
    }

    e.target.value = "";
  };

  const removePhoto = async (itemId: string, photoUrl: string) => {
    setPhotos((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter((p) => p.url !== photoUrl),
    }));
    const pathParts = photoUrl.split("/checklist-photos/");
    if (pathParts[1]) {
      await supabase.storage.from("checklist-photos").remove([pathParts[1]]);
    }
    if (runId) {
      await supabase.from("checklist_photos").delete().eq("run_id", runId).eq("item_id", itemId).eq("photo_url", photoUrl);
    }
  };

  const openPhotoPicker = (itemId: string) => {
    setActivePhotoItemId(itemId);
    fileInputRef.current?.click();
  };

  const getSectionCompletion = (section: Section) => {
    const required = section.items.filter((i) => i.required);
    const completed = required.filter((i) => {
      if (i.type === "PHOTO") return (photos[i.id]?.filter((p) => !p.uploading).length || 0) > 0;
      return responses[i.id] === true;
    });
    return { done: completed.length, total: required.length };
  };

  const validateWorkLog = (): boolean => {
    if (!workStart || !workEnd) {
      setWorkLogError("Both Check-In and Check-Out times are required.");
      return false;
    }
    if (workEnd <= workStart) {
      setWorkLogError("Check-Out time must be after Check-In time.");
      return false;
    }
    setWorkLogError(null);
    return true;
  };

  const validateShopping = (): boolean => {
    if (shoppingChecked === null || shoppingChecked === false) {
      setShoppingError("You must confirm shopping has been checked.");
      return false;
    }
    setShoppingError(null);
    return true;
  };

  const canFinish = () => {
    const sectionsOk = sections.every((section) => {
      const { done, total } = getSectionCompletion(section);
      return done >= total;
    });
    return sectionsOk && workStart && workEnd && workEnd > workStart && shoppingChecked === true;
  };

  const handleFinish = async () => {
    const workLogValid = validateWorkLog();
    const shoppingValid = validateShopping();
    
    if (!workLogValid || !shoppingValid) return;
    
    if (!canFinish()) {
      toast({ title: "Incomplete", description: "Please complete all required items before finishing.", variant: "destructive" });
      return;
    }
    if (!runId || !taskId || !user) return;

    setFinishing(true);

    const finishedAt = new Date().toISOString();
    const today = new Date().toISOString().split("T")[0];

    // Calculate duration from work start/end
    const [sh, sm] = workStart.split(":").map(Number);
    const [eh, em] = workEnd.split(":").map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

    // Save all YES/NO responses
    const responseEntries = Object.entries(responses)
      .filter(([, val]) => val !== null)
      .map(([itemId, val]) => ({
        run_id: runId,
        item_id: itemId,
        yesno_value: val,
        org_id: orgId,
      }));

    if (responseEntries.length > 0) {
      await supabase.from("checklist_responses").insert(responseEntries);
    }

    // Update run with finish time
    await supabase.from("checklist_runs").update({
      finished_at: finishedAt,
      duration_minutes: durationMinutes,
    }).eq("id", runId);

    // UPSERT LogHours with source=CHECKLIST (unique on checklist_run_id)
    // Use upsert pattern: try insert, if conflict do nothing (already logged)
    await supabase.from("log_hours").upsert({
      user_id: user.id,
      date: today,
      start_at: workStart,
      end_at: workEnd,
      duration_minutes: durationMinutes,
      source: "CHECKLIST" as const,
      checklist_run_id: runId,
      cleaning_task_id: taskId,
      property_id: task?.property_id || null,
      room_id: task?.room_id || null,
      description: workNotes || null,
      org_id: orgId,
    }, { onConflict: "checklist_run_id" });

    // Create shopping list entries for missing items
    for (const item of missingItems) {
      const { data: existing } = await supabase
        .from("shopping_list")
        .select("id, quantity_needed, status")
        .eq("product_id", item.productId)
        .in("status", ["MISSING", "ORDERED"])
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from("shopping_list").update({
          quantity_needed: (existing[0].quantity_needed || 1) + item.quantity,
          status: "MISSING" as const,
          note: item.note || existing[0].status,
        }).eq("id", existing[0].id);
      } else {
        await supabase.from("shopping_list").insert({
          product_id: item.productId,
          created_by_user_id: user.id,
          status: "MISSING" as const,
          quantity_needed: item.quantity,
          note: item.note || null,
          created_from: "CHECKLIST" as const,
          checklist_run_id: runId,
          property_id: task?.property_id || null,
          room_id: task?.room_id || null,
          org_id: orgId,
        });
      }
    }

    // Mark task as DONE
    await supabase.from("cleaning_tasks").update({
      status: "DONE" as const,
      checklist_run_id: runId,
    }).eq("id", taskId);

    toast({ title: "Checklist complete!", description: `Duration: ${durationMinutes} minutes` });
    navigate(`/tasks/${taskId}`);
  };

  if (alreadyFinished) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">This cleaning task has already been completed.</p>
        <Button variant="outline" onClick={() => navigate(`/tasks/${taskId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Task
        </Button>
      </div>
    );
  }

  if (!task || sections.length === 0) {
    return <div className="p-6 text-muted-foreground">Loading checklist...</div>;
  }

  const shoppingCompletion = shoppingChecked === true ? { done: 1, total: 1 } : { done: 0, total: 1 };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Cleaning Checklist"
        description={`${task.properties?.name} — ${task.rooms?.name || "All rooms"}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/tasks/${taskId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoUpload}
      />

      <WorkLogSection
        workStart={workStart}
        workEnd={workEnd}
        workNotes={workNotes}
        onWorkStartChange={setWorkStart}
        onWorkEndChange={setWorkEnd}
        onWorkNotesChange={setWorkNotes}
        error={workLogError}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border bg-card px-4 overflow-x-auto">
            <TabsList className="h-auto bg-transparent gap-0 p-0">
              {sections.map((section) => {
                const { done, total } = getSectionCompletion(section);
                const isComplete = done >= total && total > 0;
                return (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className={cn(
                      "px-3 py-2.5 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent whitespace-nowrap",
                      isComplete && "text-[hsl(var(--status-done))]"
                    )}
                  >
                    {section.title}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {done}/{total}
                    </span>
                  </TabsTrigger>
                );
              })}
              <TabsTrigger
                value={SHOPPING_TAB_ID}
                className={cn(
                  "px-3 py-2.5 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent whitespace-nowrap",
                  shoppingChecked === true && "text-[hsl(var(--status-done))]"
                )}
              >
                Shopping
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {shoppingCompletion.done}/{shoppingCompletion.total}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {sections.map((section) => (
              <TabsContent key={section.id} value={section.id} className="mt-0 space-y-2">
                {section.items.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-3">
                      {item.type === "YESNO" ? (
                        <button
                          onClick={() => toggleYesNo(item.id)}
                          className="w-full flex items-center gap-3 text-left"
                        >
                          <div
                            className={cn(
                              "h-10 w-10 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors",
                              responses[item.id] === true
                                ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))] text-card"
                                : "border-border hover:border-primary"
                            )}
                          >
                            {responses[item.id] === true && <Check className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className={cn(
                              "text-sm font-medium",
                              responses[item.id] === true && "line-through text-muted-foreground"
                            )}>
                              {item.label}
                              {!item.required && <span className="text-xs text-muted-foreground ml-1">(optional)</span>}
                            </p>
                            {item.help_text && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.help_text}</p>
                            )}
                          </div>
                        </button>
                      ) : item.type === "PHOTO" ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium">{item.label}</p>
                              {item.help_text && (
                                <p className="text-xs text-muted-foreground">{item.help_text}</p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPhotoPicker(item.id)}
                              className="gap-1.5 shrink-0"
                            >
                              <Camera className="h-4 w-4" /> Add Photo
                            </Button>
                          </div>
                          {(photos[item.id]?.length || 0) > 0 && (
                            <div className="flex gap-2 flex-wrap mt-2">
                              {photos[item.id].map((photo, idx) => (
                                <div key={idx} className="relative h-20 w-20 rounded-lg overflow-hidden border border-border">
                                  {photo.uploading ? (
                                    <div className="h-full w-full flex items-center justify-center bg-muted">
                                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                  ) : (
                                    <>
                                      <img src={photo.url} alt="" className="h-full w-full object-cover" />
                                      <button
                                        onClick={() => removePhoto(item.id, photo.url)}
                                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {item.required && (photos[item.id]?.filter(p => !p.uploading).length || 0) === 0 && (
                            <p className="text-xs text-destructive mt-1">Required: at least 1 photo</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm">{item.label}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {(() => {
                  const { done, total } = getSectionCompletion(section);
                  if (done >= total && total > 0) return null;
                  const uncheckedYesNo = section.items.filter(
                    (i) => i.type === "YESNO" && i.required && responses[i.id] !== true
                  );
                  if (uncheckedYesNo.length === 0) return null;
                  return (
                    <Button
                      variant="outline"
                      className="w-full mt-3"
                      onClick={() => {
                        const updates: Record<string, boolean> = {};
                        uncheckedYesNo.forEach((i) => { updates[i.id] = true; });
                        setResponses((prev) => ({ ...prev, ...updates }));
                      }}
                    >
                      <Check className="h-4 w-4 mr-2" /> Mark Section Complete
                    </Button>
                  );
                })()}
              </TabsContent>
            ))}

            <TabsContent value={SHOPPING_TAB_ID} className="mt-0">
              <ShoppingCheckSection
                shoppingChecked={shoppingChecked}
                onShoppingCheckedChange={setShoppingChecked}
                missingItems={missingItems}
                onMissingItemsChange={setMissingItems}
                error={shoppingError}
              />
            </TabsContent>
          </div>
        </Tabs>

        <div className="border-t border-border bg-card p-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {sections.reduce((a, s) => a + getSectionCompletion(s).done, 0) + shoppingCompletion.done} / {sections.reduce((a, s) => a + getSectionCompletion(s).total, 0) + shoppingCompletion.total} items complete
          </div>
          <Button
            onClick={handleFinish}
            disabled={!canFinish() || finishing}
            className="gap-2"
            size="lg"
          >
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Finish Checklist
          </Button>
        </div>
      </div>
    </div>
  );
}
