import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Camera, X, Loader2, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

interface ShoppingEntry {
  product_id: string;
  product_name: string;
  quantity: number;
  note: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoItemId, setActivePhotoItemId] = useState<string | null>(null);

  // Work Log state
  const [workStart, setWorkStart] = useState(format(new Date(), "HH:mm"));
  const [workEnd, setWorkEnd] = useState("");
  const [workNotes, setWorkNotes] = useState("");
  const [workDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startedAt] = useState(new Date().toISOString());

  // Shopping state
  const [shoppingChecked, setShoppingChecked] = useState<boolean | null>(null);
  const [shoppingEntries, setShoppingEntries] = useState<ShoppingEntry[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [shoppingQty, setShoppingQty] = useState(1);
  const [shoppingNote, setShoppingNote] = useState("");

  // Load task + template sections + products
  useEffect(() => {
    if (!taskId || !user) return;

    const load = async () => {
      const { data: taskData } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(name, timezone), rooms(name, checklist_template_id)")
        .eq("id", taskId)
        .single();
      setTask(taskData);

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

      const { data: run } = await supabase
        .from("checklist_runs")
        .insert({
          cleaning_task_id: taskId,
          property_id: taskData?.property_id,
          room_id: taskData?.room_id,
          cleaner_user_id: user.id,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (run) setRunId(run.id);

      if (taskData?.status === "TODO") {
        await supabase.from("cleaning_tasks").update({ status: "IN_PROGRESS" as const }).eq("id", taskId);
      }
    };

    const loadProducts = async () => {
      const { data } = await supabase.from("products").select("*").eq("active", true).order("name");
      setProducts(data || []);
    };

    load();
    loadProducts();
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

  const addShoppingEntry = () => {
    if (!selectedProduct) return;
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;
    // Prevent duplicates
    if (shoppingEntries.some((e) => e.product_id === selectedProduct)) {
      toast({ title: "Already added", description: "This product is already in the list.", variant: "destructive" });
      return;
    }
    setShoppingEntries((prev) => [
      ...prev,
      { product_id: selectedProduct, product_name: product.name, quantity: shoppingQty, note: shoppingNote },
    ]);
    setSelectedProduct("");
    setShoppingQty(1);
    setShoppingNote("");
  };

  const removeShoppingEntry = (productId: string) => {
    setShoppingEntries((prev) => prev.filter((e) => e.product_id !== productId));
  };

  const getSectionCompletion = (section: Section) => {
    const required = section.items.filter((i) => i.required);
    const completed = required.filter((i) => {
      if (i.type === "PHOTO") return (photos[i.id]?.filter((p) => !p.uploading).length || 0) > 0;
      return responses[i.id] === true;
    });
    return { done: completed.length, total: required.length };
  };

  const isWorkLogValid = () => {
    if (!workStart || !workEnd) return false;
    const [sh, sm] = workStart.split(":").map(Number);
    const [eh, em] = workEnd.split(":").map(Number);
    return (eh * 60 + em) > (sh * 60 + sm);
  };

  const isShoppingValid = () => {
    return shoppingChecked === true;
  };

  const canFinish = () => {
    const checklistComplete = sections.every((section) => {
      const { done, total } = getSectionCompletion(section);
      return done >= total;
    });
    return checklistComplete && isWorkLogValid() && isShoppingValid();
  };

  const handleFinish = async () => {
    if (!canFinish()) {
      const issues: string[] = [];
      if (!isWorkLogValid()) issues.push("Work Start/End times are invalid.");
      if (!isShoppingValid()) issues.push("Shopping must be checked.");
      const checklistComplete = sections.every((s) => { const { done, total } = getSectionCompletion(s); return done >= total; });
      if (!checklistComplete) issues.push("Complete all required checklist items.");
      toast({ title: "Incomplete", description: issues.join(" "), variant: "destructive" });
      return;
    }
    if (!runId || !taskId || !user) return;

    setFinishing(true);

    const finishedAt = new Date().toISOString();
    const [sh, sm] = workStart.split(":").map(Number);
    const [eh, em] = workEnd.split(":").map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

    // Save YES/NO responses
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

    // Update run
    await supabase.from("checklist_runs").update({
      finished_at: finishedAt,
      duration_minutes: durationMinutes,
    }).eq("id", runId);

    // Upsert log_hours (source=CHECKLIST)
    await supabase.from("log_hours").insert({
      user_id: user.id,
      date: workDate,
      start_at: workStart,
      end_at: workEnd,
      duration_minutes: durationMinutes,
      description: workNotes || `Checklist cleaning`,
      source: "CHECKLIST" as any,
      checklist_run_id: runId,
      cleaning_task_id: taskId,
      property_id: task?.property_id,
      room_id: task?.room_id,
    });

    // Save shopping entries
    for (const entry of shoppingEntries) {
      // Check if product already in shopping_list with open status
      const { data: existing } = await supabase
        .from("shopping_list")
        .select("id, status, quantity_needed")
        .eq("product_id", entry.product_id)
        .in("status", ["MISSING", "ORDERED"])
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing - increment quantity or reset to MISSING
        await supabase.from("shopping_list").update({
          status: "MISSING" as const,
          quantity_needed: (existing[0].quantity_needed || 1) + entry.quantity,
          note: entry.note || undefined,
          updated_at: new Date().toISOString(),
        }).eq("id", existing[0].id);
      } else {
        // Check if OK exists - reset to MISSING
        const { data: okItem } = await supabase
          .from("shopping_list")
          .select("id")
          .eq("product_id", entry.product_id)
          .eq("status", "OK")
          .limit(1);

        if (okItem && okItem.length > 0) {
          await supabase.from("shopping_list").update({
            status: "MISSING" as const,
            quantity_needed: entry.quantity,
            note: entry.note || undefined,
            created_from: "CHECKLIST" as any,
            checklist_run_id: runId,
            updated_at: new Date().toISOString(),
          }).eq("id", okItem[0].id);
        } else {
          await supabase.from("shopping_list").insert({
            product_id: entry.product_id,
            created_by_user_id: user.id,
            status: "MISSING",
            quantity_needed: entry.quantity,
            note: entry.note || undefined,
            created_from: "CHECKLIST" as any,
            checklist_run_id: runId,
            property_id: task?.property_id,
            room_id: task?.room_id,
          });
        }
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

  if (!task || sections.length === 0) {
    return <div className="p-6 text-muted-foreground">Loading checklist...</div>;
  }

  const totalDone = sections.reduce((a, s) => a + getSectionCompletion(s).done, 0);
  const totalRequired = sections.reduce((a, s) => a + getSectionCompletion(s).total, 0);

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

      {/* Work Log Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Work Log</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Work Start *</Label>
            <Input
              type="time"
              value={workStart}
              onChange={(e) => setWorkStart(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Work End *</Label>
            <Input
              type="time"
              value={workEnd}
              onChange={(e) => setWorkEnd(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
              placeholder="Optional notes..."
              className="h-9 text-sm"
            />
          </div>
        </div>
        {workStart && workEnd && !isWorkLogValid() && (
          <p className="text-xs text-destructive mt-1">Work End must be after Work Start</p>
        )}
      </div>

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
              {/* Shopping tab */}
              <TabsTrigger
                value="__shopping__"
                className={cn(
                  "px-3 py-2.5 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent whitespace-nowrap",
                  isShoppingValid() && "text-[hsl(var(--status-done))]"
                )}
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                Shopping
                {isShoppingValid() && <Check className="h-3 w-3 ml-1" />}
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

            {/* Shopping Tab Content */}
            <TabsContent value="__shopping__" className="mt-0 space-y-3">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-2">Shopping checked? *</p>
                    <div className="flex gap-2">
                      <Button
                        variant={shoppingChecked === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShoppingChecked(true)}
                        className="gap-1.5"
                      >
                        <Check className="h-4 w-4" /> Yes — all checked
                      </Button>
                      <Button
                        variant={shoppingChecked === false ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => setShoppingChecked(false)}
                      >
                        No
                      </Button>
                    </div>
                    {shoppingChecked === false && (
                      <p className="text-xs text-destructive mt-2">You must check shopping before submitting the checklist.</p>
                    )}
                  </div>

                  {shoppingChecked === true && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <p className="text-sm font-medium">Missing items? Add them below:</p>
                      <div className="flex gap-2 flex-wrap">
                        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                          <SelectTrigger className="flex-1 min-w-[180px] h-9 text-sm">
                            <SelectValue placeholder="Select a product..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}{p.category ? ` (${p.category})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          value={shoppingQty}
                          onChange={(e) => setShoppingQty(parseInt(e.target.value) || 1)}
                          className="w-16 h-9 text-sm"
                          placeholder="Qty"
                        />
                        <Input
                          value={shoppingNote}
                          onChange={(e) => setShoppingNote(e.target.value)}
                          className="w-32 h-9 text-sm"
                          placeholder="Note..."
                        />
                        <Button size="sm" onClick={addShoppingEntry} disabled={!selectedProduct} className="h-9">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {shoppingEntries.length > 0 && (
                        <div className="space-y-2">
                          {shoppingEntries.map((entry) => (
                            <div key={entry.product_id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                              <div>
                                <p className="text-sm font-medium">{entry.product_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Qty: {entry.quantity}{entry.note ? ` · ${entry.note}` : ""}
                                </p>
                              </div>
                              <button onClick={() => removeShoppingEntry(entry.product_id)} className="text-muted-foreground hover:text-destructive">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {shoppingEntries.length === 0 && (
                        <p className="text-xs text-muted-foreground">No missing items — great! You can still add any if needed.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Finish bar */}
        <div className="border-t border-border bg-card p-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {totalDone}/{totalRequired} items
            {isWorkLogValid() && " · ✓ Work Log"}
            {isShoppingValid() && " · ✓ Shopping"}
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
