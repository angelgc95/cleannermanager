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

export default function ChecklistRunPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [task, setTask] = useState<any>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, boolean | null>>({});
  const [photos, setPhotos] = useState<Record<string, PhotoEntry[]>>({});
  const [activeTab, setActiveTab] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [startedAt] = useState(new Date().toISOString());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoItemId, setActivePhotoItemId] = useState<string | null>(null);

  // Load task + template sections
  useEffect(() => {
    if (!taskId || !user) return;

    const load = async () => {
      // Get task
      const { data: taskData } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(name, timezone), rooms(name, checklist_template_id)")
        .eq("id", taskId)
        .single();
      setTask(taskData);

      // Get template — use room's template or fallback to default
      const templateId = taskData?.rooms?.checklist_template_id || "00000000-0000-0000-0000-000000000001";

      const { data: sectionsData } = await supabase
        .from("checklist_sections")
        .select("id, title, sort_order")
        .eq("template_id", templateId)
        .order("sort_order");

      if (!sectionsData || sectionsData.length === 0) return;

      // Get items for all sections
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

      // Create checklist run
      const { data: run } = await supabase
        .from("checklist_runs")
        .insert({
          cleaning_task_id: taskId,
          property_id: taskData?.property_id,
          room_id: taskData?.room_id,
          cleaner_user_id: user.id,
          started_at: startedAt,
        })
        .select("id")
        .single();

      if (run) setRunId(run.id);

      // Mark task as in progress
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

      // Add placeholder
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

      // Save to checklist_photos table
      await supabase.from("checklist_photos").insert({
        run_id: runId,
        item_id: activePhotoItemId,
        photo_url: urlData.publicUrl,
        sort_order: (photos[activePhotoItemId]?.length || 0),
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
    // Delete from storage
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

  const canFinish = () => {
    return sections.every((section) => {
      const { done, total } = getSectionCompletion(section);
      return done >= total;
    });
  };

  const handleFinish = async () => {
    if (!canFinish()) {
      toast({ title: "Incomplete", description: "Please complete all required items before finishing.", variant: "destructive" });
      return;
    }
    if (!runId || !taskId) return;

    setFinishing(true);

    const finishedAt = new Date().toISOString();
    const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    // Save all YES/NO responses
    const responseEntries = Object.entries(responses)
      .filter(([, val]) => val !== null)
      .map(([itemId, val]) => ({
        run_id: runId,
        item_id: itemId,
        yesno_value: val,
      }));

    if (responseEntries.length > 0) {
      await supabase.from("checklist_responses").insert(responseEntries);
    }

    // Update run with finish time
    await supabase.from("checklist_runs").update({
      finished_at: finishedAt,
      duration_minutes: durationMinutes,
    }).eq("id", runId);

    // Mark task as DONE
    await supabase.from("cleaning_tasks").update({
      status: "DONE" as const,
      checklist_run_id: runId,
    }).eq("id", taskId);

    toast({ title: "Checklist complete!", description: `Duration: ${durationMinutes} minutes` });
    navigate(`/tasks/${taskId}`);
  };

  if (!task || sections.length === 0) {
    return <div className="p-6 text-muted-foreground">Loading checklist...</div>;
  }

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

                {/* Section complete button */}
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
          </div>
        </Tabs>

        {/* Finish bar */}
        <div className="border-t border-border bg-card p-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {sections.reduce((a, s) => a + getSectionCompletion(s).done, 0)} / {sections.reduce((a, s) => a + getSectionCompletion(s).total, 0)} items complete
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
