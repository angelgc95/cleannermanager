import { useEffect, useState, useRef, useCallback, forwardRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Camera, X, Loader2, Clock, LogIn, LogOut, AlarmClock, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShoppingCheckSection } from "@/components/checklist/ShoppingCheckSection";
import { ChecklistTemplateEditor } from "@/components/admin/ChecklistTemplateEditor";
import type { Section, ChecklistItem } from "@/components/admin/ChecklistTemplateEditor";
import { EventInlineEdit } from "@/components/admin/EventInlineEdit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PhotoEntry {
  id?: string;
  url: string;
  storagePath?: string;
  uploading?: boolean;
}

interface MissingItem {
  productId: string;
  productName: string;
  quantity: number;
  note: string;
}

const SHOPPING_TAB_ID = "__shopping__";
const CLOCK_IN_TAB_ID = "__clock_in__";
const CLOCK_OUT_TAB_ID = "__clock_out__";

const ChecklistRunPage = forwardRef<HTMLDivElement>(function ChecklistRunPage(_props, _ref) {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user, hostId, role } = useAuth();
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState<string>("");

  const [event, setEvent] = useState<any>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, boolean | null>>({});
  const [photos, setPhotos] = useState<Record<string, PhotoEntry[]>>({});
  const [activeTab, setActiveTab] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [alreadyFinished, setAlreadyFinished] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoItemId, setActivePhotoItemId] = useState<string | null>(null);
  const activePhotoItemIdRef = useRef<string | null>(null);

  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [workStart, setWorkStart] = useState(nowTime());
  const [workEnd, setWorkEnd] = useState("");
  const [workNotes, setWorkNotes] = useState("");
  const [workLogError, setWorkLogError] = useState<string | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockedOut, setClockedOut] = useState(false);

  const [shoppingChecked, setShoppingChecked] = useState<boolean | null>(null);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [shoppingError, setShoppingError] = useState<string | null>(null);

  // Timer alarm state: itemId -> seconds remaining
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
  const [expiredTimers, setExpiredTimers] = useState<Set<string>>(new Set());

  // Tick all active timers every second
  useEffect(() => {
    const hasActive = Object.keys(activeTimers).some(id => activeTimers[id] > 0);
    if (!hasActive) return;

    const interval = setInterval(() => {
      setActiveTimers(prev => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (next[id] > 0) {
            next[id] = next[id] - 1;
            if (next[id] <= 0) {
              setExpiredTimers(s => new Set(s).add(id));
            }
          }
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [Object.keys(activeTimers).length]);

  const dismissTimer = useCallback((itemId: string) => {
    setExpiredTimers(s => {
      const next = new Set(s);
      next.delete(itemId);
      return next;
    });
    setActiveTimers(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Start any TIMER items that depend on the given item
  const startDependentTimers = useCallback((triggeredItemId: string) => {
    const allItems = sections.flatMap(s => s.items);
    const timerItems = allItems.filter(
      i => i.type === "TIMER" && i.depends_on_item_id === triggeredItemId && i.timer_minutes && i.timer_minutes > 0
    );
    for (const timer of timerItems) {
      if (!activeTimers[timer.id] && !expiredTimers.has(timer.id)) {
        setActiveTimers(prev => ({ ...prev, [timer.id]: timer.timer_minutes! * 60 }));
        toast({ title: `⏰ Timer started`, description: `${timer.label} — ${timer.timer_minutes} min` });
      }
    }
  }, [sections, activeTimers, expiredTimers, toast]);

  // Cancel any TIMER items that depend on the given item
  const cancelDependentTimers = useCallback((triggeredItemId: string) => {
    const allItems = sections.flatMap(s => s.items);
    const timerItems = allItems.filter(
      i => i.type === "TIMER" && i.depends_on_item_id === triggeredItemId
    );
    for (const timer of timerItems) {
      dismissTimer(timer.id);
    }
  }, [sections, dismissTimer]);

  // Load existing photos from DB when runId is available
  useEffect(() => {
    if (!runId) return;
    const loadPhotos = async () => {
      const { data: dbPhotos } = await supabase
        .from("checklist_photos")
        .select("id, photo_url, item_id, sort_order")
        .eq("run_id", runId)
        .order("sort_order");
      if (!dbPhotos || dbPhotos.length === 0) return;

      const photosByItem: Record<string, PhotoEntry[]> = {};
      await Promise.all(
        dbPhotos.map(async (p: any) => {
          const storagePath = p.photo_url;
          let url = storagePath;
          if (!storagePath.startsWith("http")) {
            const { data: signed } = await supabase.storage
              .from("checklist-photos")
              .createSignedUrl(storagePath, 86400);
            if (signed?.signedUrl) url = signed.signedUrl;
          }
          if (!photosByItem[p.item_id]) photosByItem[p.item_id] = [];
          photosByItem[p.item_id].push({
            id: p.id,
            url,
            storagePath,
            uploading: false,
          });
        })
      );
      setPhotos(prev => ({ ...prev, ...photosByItem }));
    };
    loadPhotos();
  }, [runId]);

  useEffect(() => {
    if (!eventId || !user) return;

    const load = async () => {
      const { data: eventData } = await supabase
        .from("cleaning_events")
        .select("*, listings(name, timezone)")
        .eq("id", eventId)
        .single();
      setEvent(eventData);

      if (eventData?.status === "DONE") {
        setAlreadyFinished(true);
        return;
      }

      // If event was reset to TODO but old finished run exists, clean it up
      const eventIsReset = eventData?.status === "TODO";

      let tplId = eventData?.checklist_template_id || "";
      if (!tplId && eventData?.listing_id) {
        const { data: tpl } = await supabase
          .from("checklist_templates")
          .select("id")
          .eq("listing_id", eventData.listing_id)
          .eq("active", true)
          .limit(1)
          .single();
        if (tpl) tplId = tpl.id;
      }
      if (!tplId) return;
      setTemplateId(tplId);

      const { data: sectionsData } = await supabase
        .from("checklist_sections")
        .select("id, title, sort_order")
        .eq("template_id", tplId)
        .order("sort_order");

      if (!sectionsData || sectionsData.length === 0) return;

      const sectionIds = sectionsData.map((s) => s.id);
      const { data: itemsData } = await supabase
        .from("checklist_items")
        .select("id, item_key, label, type, required, sort_order, help_text, section_id, timer_minutes, depends_on_item_id")
        .in("section_id", sectionIds)
        .order("sort_order");

      const fullSections: Section[] = sectionsData.map((s) => ({
        ...s,
        items: (itemsData || []).filter((i: any) => i.section_id === s.id) as ChecklistItem[],
      }));

      setSections(fullSections);
      if (fullSections.length > 0) setActiveTab(CLOCK_IN_TAB_ID);

      // Check for ANY existing run for this event (finished or not)
      const { data: existingRuns } = await supabase
        .from("checklist_runs")
        .select("id, finished_at")
        .eq("cleaning_event_id", eventId)
        .limit(1);

      const needsNewRun = !existingRuns || existingRuns.length === 0 ||
        (existingRuns[0].finished_at && eventIsReset);

      if (existingRuns && existingRuns.length > 0 && !needsNewRun) {
        setRunId(existingRuns[0].id);
        if (existingRuns[0].finished_at) {
          setAlreadyFinished(true);
        }
      }

      if (needsNewRun) {
        const startedAt = new Date().toISOString();
        const { data: run, error: insertError } = await supabase
          .from("checklist_runs")
          .insert({
            cleaning_event_id: eventId,
            listing_id: eventData?.listing_id || null,
            cleaner_user_id: user.id,
            host_user_id: eventData?.host_user_id,
            started_at: startedAt,
          } as any)
          .select("id")
          .single();

        if (insertError && insertError.code === "23505") {
          const { data: conflictRun } = await supabase
            .from("checklist_runs")
            .select("id, finished_at")
            .eq("cleaning_event_id", eventId)
            .limit(1)
            .single();
          if (conflictRun) {
            setRunId(conflictRun.id);
            if (conflictRun.finished_at) setAlreadyFinished(true);
          }
        } else if (run) {
          setRunId(run.id);
        }
      }

      if (eventData?.status === "TODO") {
        await supabase.from("cleaning_events").update({ status: "IN_PROGRESS" }).eq("id", eventId);
      }
    };

    load();
  }, [eventId, user]);

  const toggleYesNo = (itemId: string) => {
    const newVal = responses[itemId] === true ? null : true;
    setResponses((prev) => ({
      ...prev,
      [itemId]: newVal,
    }));

    // When an item is marked done, start any TIMER items that depend on it
    if (newVal === true) {
      startDependentTimers(itemId);
    } else {
      cancelDependentTimers(itemId);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const currentItemId = activePhotoItemIdRef.current;
    if (!e.target.files || !currentItemId || !runId || !user) return;
    const files = Array.from(e.target.files);

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${runId}/${currentItemId}/${crypto.randomUUID()}.${ext}`;

      const tempId = crypto.randomUUID();
      setPhotos((prev) => ({
        ...prev,
        [currentItemId]: [...(prev[currentItemId] || []), { id: tempId, url: "", uploading: true }],
      }));

      const { data, error } = await supabase.storage
        .from("checklist-photos")
        .upload(path, file, { contentType: file.type });

      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        setPhotos((prev) => ({
          ...prev,
          [currentItemId]: (prev[currentItemId] || []).filter((p) => p.id !== tempId),
        }));
        continue;
      }

      const { data: signedData } = await supabase.storage.from("checklist-photos").createSignedUrl(data.path, 86400);
      const photoUrl = signedData?.signedUrl || data.path;

      const { error: dbError } = await supabase.from("checklist_photos").insert({
        run_id: runId,
        item_id: currentItemId,
        photo_url: data.path,
        sort_order: (photos[currentItemId]?.length || 0),
        host_user_id: hostId,
      } as any);

      if (dbError) {
        await supabase.storage.from("checklist-photos").remove([data.path]);
        toast({ title: "Failed to save photo", description: dbError.message, variant: "destructive" });
        setPhotos((prev) => ({
          ...prev,
          [currentItemId]: (prev[currentItemId] || []).filter((p) => p.id !== tempId),
        }));
        continue;
      }

      setPhotos((prev) => ({
        ...prev,
        [currentItemId]: (prev[currentItemId] || []).map((p) =>
          p.id === tempId ? { ...p, url: photoUrl, storagePath: data.path, uploading: false } : p
        ),
      }));
    }

    e.target.value = "";
  };

  const removePhoto = async (itemId: string, photoUrl: string, storagePath?: string) => {
    setPhotos((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter((p) => p.url !== photoUrl),
    }));
    // Use storagePath if available, otherwise extract from URL
    const path = storagePath || (photoUrl.includes("/checklist-photos/") ? photoUrl.split("/checklist-photos/").pop() : null);
    if (path) {
      await supabase.storage.from("checklist-photos").remove([path]);
    }
    if (runId) {
      // Delete by storage path (new format) or full URL (legacy)
      const dbPath = storagePath || photoUrl;
      await supabase.from("checklist_photos").delete().eq("run_id", runId).eq("item_id", itemId).eq("photo_url", dbPath);
    }
  };

  const openPhotoPicker = (itemId: string) => {
    activePhotoItemIdRef.current = itemId;
    setActivePhotoItemId(itemId);
    fileInputRef.current?.click();
  };

  const getSectionCompletion = (section: Section) => {
    // TIMER items are not required for section completion
    const required = section.items.filter((i) => i.required && i.type !== "TIMER");
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
    setShoppingError(null);
    return true;
  };

  const canFinish = () => {
    const sectionsOk = sections.every((section) => {
      const { done, total } = getSectionCompletion(section);
      return done >= total;
    });
    return sectionsOk && clockedIn && clockedOut && workStart && workEnd && workEnd > workStart;
  };

  const handleFinish = async () => {
    const workLogValid = validateWorkLog();
    const shoppingValid = validateShopping();
    
    if (!workLogValid || !shoppingValid) return;
    
    if (!canFinish()) {
      toast({ title: "Incomplete", description: "Please complete all required items before finishing.", variant: "destructive" });
      return;
    }
    if (!runId || !eventId || !user) return;

    setFinishing(true);

    const finishedAt = new Date().toISOString();
    const today = new Date().toISOString().split("T")[0];

    const [sh, sm] = workStart.split(":").map(Number);
    const [eh, em] = workEnd.split(":").map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

    const responseEntries = Object.entries(responses)
      .filter(([, val]) => val !== null)
      .map(([itemId, val]) => ({
        run_id: runId,
        item_id: itemId,
        yesno_value: val,
        host_user_id: hostId,
      }));

    if (responseEntries.length > 0) {
      await supabase.from("checklist_responses").insert(responseEntries);
    }

    await supabase.from("checklist_runs").update({
      finished_at: finishedAt,
      duration_minutes: durationMinutes,
    }).eq("id", runId);

    await supabase.from("log_hours").upsert({
      user_id: user.id,
      date: today,
      start_at: workStart,
      end_at: workEnd,
      duration_minutes: durationMinutes,
      source: "CHECKLIST" as const,
      checklist_run_id: runId,
      cleaning_event_id: eventId,
      listing_id: event?.listing_id || null,
      description: workNotes || null,
      host_user_id: hostId,
    } as any, { onConflict: "checklist_run_id" });

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
          listing_id: event?.listing_id || null,
          host_user_id: hostId,
        } as any);
      }
    }

    await supabase.from("cleaning_events").update({
      status: "DONE",
      checklist_run_id: runId,
    }).eq("id", eventId);

    toast({ title: "Checklist complete!", description: `Duration: ${durationMinutes} minutes` });
    navigate(`/events/${eventId}`);
  };

  if (alreadyFinished) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">This cleaning event has already been completed.</p>
        <Button variant="outline" onClick={() => navigate(`/events/${eventId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Event
        </Button>
      </div>
    );
  }

  if (!event) {
    return <div className="p-6 text-muted-foreground">Loading checklist...</div>;
  }

  if (sections.length === 0) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">No checklist template has been set up for this listing yet. Ask your host to create one.</p>
        <Button variant="outline" onClick={() => navigate(`/events/${eventId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Event
        </Button>
      </div>
    );
  }

  const allTabs = [CLOCK_IN_TAB_ID, ...sections.map(s => s.id), SHOPPING_TAB_ID, CLOCK_OUT_TAB_ID];
  const goToNextTab = () => {
    const currentIdx = allTabs.indexOf(activeTab);
    if (currentIdx < allTabs.length - 1) {
      setActiveTab(allTabs[currentIdx + 1]);
    }
  };

  // Render a TIMER item card
  const renderTimerItem = (item: ChecklistItem) => {
    const isRunning = activeTimers[item.id] !== undefined && activeTimers[item.id] > 0;
    const isExpired = expiredTimers.has(item.id);
    const depItem = item.depends_on_item_id
      ? sections.flatMap(s => s.items).find(i => i.id === item.depends_on_item_id)
      : null;
    const depDone = item.depends_on_item_id ? responses[item.depends_on_item_id] === true : false;
    const isWaiting = !isRunning && !isExpired && !depDone;
    const isIdle = !isRunning && !isExpired && depDone && !activeTimers[item.id];

    return (
      <div className="w-full space-y-2">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors",
            isExpired ? "bg-destructive border-destructive text-destructive-foreground animate-pulse" :
            isRunning ? "bg-primary/10 border-primary text-primary" :
            "border-border"
          )}>
            {isExpired ? <Bell className="h-5 w-5" /> :
             isRunning ? <AlarmClock className="h-5 w-5" /> :
             <AlarmClock className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.label}</p>
            {isWaiting && depItem && (
              <p className="text-xs text-muted-foreground">Waiting for: {depItem.label}</p>
            )}
            {isRunning && (
              <p className="text-lg font-mono font-bold text-primary">{formatTimer(activeTimers[item.id])}</p>
            )}
            {isExpired && (
              <p className="text-xs font-semibold text-destructive animate-pulse">⏰ Time's up!</p>
            )}
            {isIdle && (
              <p className="text-xs text-muted-foreground">{item.timer_minutes}min — ready to start</p>
            )}
          </div>
          {isExpired && (
            <Button size="sm" variant="destructive" onClick={() => dismissTimer(item.id)} className="gap-1 shrink-0">
              <Check className="h-3 w-3" /> Done
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Cleaning Checklist"
        description={`${event.listings?.name || "Listing"}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/events/${eventId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      {role === "host" && (
        <div className="border-b border-border bg-muted/30 px-4 py-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <EventInlineEdit event={event} onUpdated={(updated) => setEvent(updated)} />
            {templateId && (
              <ChecklistTemplateEditor
                sections={sections}
                templateId={templateId}
                onSectionsUpdated={setSections}
              />
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Persistent Alarm Notifications */}
      {expiredTimers.size > 0 && (
        <div className="bg-destructive/10 border-b border-destructive px-4 py-2 space-y-1">
          {Array.from(expiredTimers).map(itemId => {
            const item = sections.flatMap(s => s.items).find(i => i.id === itemId);
            return (
              <div key={itemId} className="flex items-center justify-between gap-2 animate-pulse">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <Bell className="h-4 w-4" />
                  ⏰ Timer expired: {item?.label || "Unknown item"}
                </div>
                <Button size="sm" variant="destructive" onClick={() => dismissTimer(itemId)} className="gap-1 shrink-0">
                  <Check className="h-3 w-3" /> Done
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border bg-card px-4 overflow-x-auto">
            <TabsList className="h-auto bg-transparent gap-0 p-0">
              <TabsTrigger
                value={CLOCK_IN_TAB_ID}
                className={cn(
                  "px-3 py-2.5 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent whitespace-nowrap",
                  clockedIn && "text-[hsl(var(--status-done))]"
                )}
              >
                <LogIn className="h-3 w-3 mr-1" />
                Clock In
                {clockedIn && <Check className="h-3 w-3 ml-1" />}
              </TabsTrigger>
              {sections.map((section) => {
                const { done, total } = getSectionCompletion(section);
                const isComplete = done >= total && total > 0;
                const hasActiveTimer = section.items.some(i => i.type === "TIMER" && (activeTimers[i.id] > 0 || expiredTimers.has(i.id)));
                return (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className={cn(
                      "px-3 py-2.5 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent whitespace-nowrap",
                      isComplete && !hasActiveTimer && "text-[hsl(var(--status-done))]",
                      hasActiveTimer && "text-primary"
                    )}
                  >
                    {hasActiveTimer && <AlarmClock className="h-3 w-3 mr-1" />}
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
                  (optional)
                </span>
              </TabsTrigger>
              <TabsTrigger
                value={CLOCK_OUT_TAB_ID}
                className={cn(
                  "px-3 py-2.5 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent whitespace-nowrap",
                  clockedOut && "text-[hsl(var(--status-done))]"
                )}
              >
                <LogOut className="h-3 w-3 mr-1" />
                Clock Out
                {clockedOut && <Check className="h-3 w-3 ml-1" />}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Clock In Tab */}
            <TabsContent value={CLOCK_IN_TAB_ID} className="mt-0 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clock className="h-4 w-4 text-primary" />
                    Clock In
                  </div>
                  <p className="text-xs text-muted-foreground">Record your start time before beginning the checklist. Defaults to now.</p>
                  <div className="space-y-1">
                    <Label htmlFor="work-start" className="text-xs">
                      Start Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="work-start"
                      type="time"
                      value={workStart}
                      onChange={(e) => { setWorkStart(e.target.value); setClockedIn(false); }}
                      className="h-9"
                    />
                  </div>
                  {!clockedIn ? (
                    <Button className="w-full gap-2" onClick={() => { if (workStart) { setClockedIn(true); goToNextTab(); } }}>
                      <LogIn className="h-4 w-4" /> Confirm Clock In
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-[hsl(var(--status-done))]">
                      <Check className="h-4 w-4" /> Clocked in at {workStart}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {sections.map((section) => (
              <TabsContent key={section.id} value={section.id} className="mt-0 space-y-2">
                {section.items.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-3">
                      {item.type === "TIMER" ? (
                        renderTimerItem(item)
                      ) : item.type === "YESNO" ? (
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
                                        onClick={() => removePhoto(item.id, photo.url, photo.storagePath)}
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
                  const uncheckedYesNo = section.items.filter(
                    (i) => i.type === "YESNO" && i.required && responses[i.id] !== true
                  );
                   const sectionComplete = done >= total && total > 0;

                  return (
                    <div className="flex gap-2 mt-3">
                      {!sectionComplete && uncheckedYesNo.length > 0 && (
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            const updates: Record<string, boolean> = {};
                            uncheckedYesNo.forEach((i) => {
                              updates[i.id] = true;
                              startDependentTimers(i.id);
                            });
                            setResponses((prev) => ({ ...prev, ...updates }));
                          }}
                        >
                          <Check className="h-4 w-4 mr-2" /> Mark Section Complete
                        </Button>
                      )}
                      {sectionComplete && (
                        <Button
                          className="flex-1 gap-2"
                          onClick={goToNextTab}
                        >
                          Next Section →
                        </Button>
                      )}
                    </div>
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
              <div className="mt-3">
                <Button className="w-full gap-2" onClick={goToNextTab}>
                  Next: Clock Out →
                </Button>
              </div>
            </TabsContent>

            {/* Clock Out Tab */}
            <TabsContent value={CLOCK_OUT_TAB_ID} className="mt-0 space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clock className="h-4 w-4 text-primary" />
                    Clock Out
                  </div>
                  <p className="text-xs text-muted-foreground">Record your end time after completing the checklist. Defaults to now.</p>
                  <div className="space-y-1">
                    <Label htmlFor="work-end" className="text-xs">
                      End Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="work-end"
                      type="time"
                      value={workEnd || nowTime()}
                      onChange={(e) => { setWorkEnd(e.target.value); setClockedOut(false); }}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="work-notes" className="text-xs">Notes (optional)</Label>
                    <Textarea
                      id="work-notes"
                      value={workNotes}
                      onChange={(e) => setWorkNotes(e.target.value)}
                      placeholder="Any notes about the work..."
                      className="min-h-[60px] text-sm"
                    />
                  </div>
                  {workLogError && <p className="text-xs text-destructive">{workLogError}</p>}
                  {!clockedOut ? (
                    <Button className="w-full gap-2" onClick={() => {
                      const endVal = workEnd || nowTime();
                      setWorkEnd(endVal);
                      if (endVal > workStart) {
                        setClockedOut(true);
                      } else {
                        setWorkLogError("End time must be after start time.");
                      }
                    }}>
                      <LogOut className="h-4 w-4" /> Confirm Clock Out
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-[hsl(var(--status-done))]">
                      <Check className="h-4 w-4" /> Clocked out at {workEnd}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

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
});

export default ChecklistRunPage;
