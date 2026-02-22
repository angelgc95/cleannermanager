import { useEffect, useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Settings2, Plus, Loader2, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChecklistTemplateEditor } from "@/components/admin/ChecklistTemplateEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface TemplateOption { id: string; name: string; }
interface Section { id: string; title: string; sort_order: number; items: { id: string; item_key: string | null; label: string; type: string; required: boolean; sort_order: number; help_text: string | null; }[]; }

interface SectionSuggestion {
  title: string;
  sort_order: number;
  items: { label: string; type: string; required: boolean; sort_order: number; help_text: string | null; }[];
}

const DEFAULT_TEMPLATE_SECTIONS: SectionSuggestion[] = [
  {
    title: "Arrival & Check-In",
    sort_order: 1,
    items: [
      { label: "Check-in time logged", type: "YESNO", required: true, sort_order: 1, help_text: null },
      { label: "Previous guest has checked out", type: "YESNO", required: true, sort_order: 2, help_text: "Confirm the property is vacated" },
      { label: "Keys / lockbox in place", type: "YESNO", required: true, sort_order: 3, help_text: null },
      { label: "Photo of entrance on arrival", type: "PHOTO", required: false, sort_order: 4, help_text: null },
    ],
  },
  {
    title: "Kitchen",
    sort_order: 2,
    items: [
      { label: "Surfaces wiped & clean", type: "YESNO", required: true, sort_order: 1, help_text: null },
      { label: "Appliances clean (oven, microwave, fridge)", type: "YESNO", required: true, sort_order: 2, help_text: null },
      { label: "Dishes washed & put away", type: "YESNO", required: true, sort_order: 3, help_text: null },
      { label: "Bins emptied", type: "YESNO", required: true, sort_order: 4, help_text: null },
      { label: "Supplies restocked (soap, sponge, bags)", type: "YESNO", required: true, sort_order: 5, help_text: null },
      { label: "Photo of kitchen", type: "PHOTO", required: false, sort_order: 6, help_text: null },
    ],
  },
  {
    title: "Bathroom(s)",
    sort_order: 3,
    items: [
      { label: "Toilet cleaned & sanitized", type: "YESNO", required: true, sort_order: 1, help_text: null },
      { label: "Shower / bathtub cleaned", type: "YESNO", required: true, sort_order: 2, help_text: null },
      { label: "Mirror & sink cleaned", type: "YESNO", required: true, sort_order: 3, help_text: null },
      { label: "Fresh towels set out", type: "YESNO", required: true, sort_order: 4, help_text: "Check towel count matches guest number" },
      { label: "Toiletries restocked", type: "YESNO", required: true, sort_order: 5, help_text: "Shampoo, conditioner, body wash, toilet paper" },
      { label: "Photo of bathroom", type: "PHOTO", required: false, sort_order: 6, help_text: null },
    ],
  },
  {
    title: "Bedroom(s)",
    sort_order: 4,
    items: [
      { label: "Bed made with fresh linen", type: "YESNO", required: true, sort_order: 1, help_text: null },
      { label: "Surfaces dusted", type: "YESNO", required: true, sort_order: 2, help_text: null },
      { label: "Wardrobe / drawers empty & clean", type: "YESNO", required: true, sort_order: 3, help_text: null },
      { label: "Photo of bedroom", type: "PHOTO", required: false, sort_order: 4, help_text: null },
    ],
  },
  {
    title: "Living Area",
    sort_order: 5,
    items: [
      { label: "Floors vacuumed / mopped", type: "YESNO", required: true, sort_order: 1, help_text: null },
      { label: "Furniture wiped down", type: "YESNO", required: true, sort_order: 2, help_text: null },
      { label: "Windows & glass clean", type: "YESNO", required: false, sort_order: 3, help_text: null },
      { label: "TV remote & controls in place", type: "YESNO", required: true, sort_order: 4, help_text: null },
    ],
  },
  {
    title: "Final Checks & Checkout",
    sort_order: 6,
    items: [
      { label: "All lights & appliances off", type: "YESNO", required: true, sort_order: 1, help_text: null },
      { label: "Thermostat / AC set correctly", type: "YESNO", required: false, sort_order: 2, help_text: null },
      { label: "Doors & windows locked", type: "YESNO", required: true, sort_order: 3, help_text: null },
      { label: "Any damage or issues found?", type: "TEXT", required: false, sort_order: 4, help_text: "Describe any issues noticed" },
      { label: "Overall notes", type: "TEXT", required: false, sort_order: 5, help_text: null },
      { label: "Check-out time logged", type: "YESNO", required: true, sort_order: 6, help_text: null },
    ],
  },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { toast } = useToast();
  const isHost = role === "host";
  const [editorOpen, setEditorOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, listings(name)")
        .order("start_at", { ascending: true })
        .limit(200);
      setTasks(data || []);
    };
    fetch();
  }, []);

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from("checklist_templates").select("id, name").eq("active", true).order("name");
    const tpls = data || [];
    setTemplates(tpls);
    return tpls;
  }, []);

  const openEditor = useCallback(async () => {
    setEditorOpen(true);
    const tpls = await fetchTemplates();
    if (tpls.length > 0 && !selectedTemplateId) setSelectedTemplateId(tpls[0].id);
  }, [selectedTemplateId, fetchTemplates]);

  useEffect(() => {
    if (!selectedTemplateId) { setSections([]); return; }
    const fetchSections = async () => {
      const { data } = await supabase.from("checklist_sections").select("id, title, sort_order").eq("template_id", selectedTemplateId).order("sort_order");
      const secs = data || [];
      if (secs.length === 0) { setSections([]); return; }
      const { data: items } = await supabase.from("checklist_items").select("id, item_key, label, type, required, sort_order, help_text, section_id").in("section_id", secs.map((s) => s.id)).order("sort_order");
      setSections(secs.map((s) => ({ ...s, items: (items || []).filter((i: any) => i.section_id === s.id).map(({ section_id, ...rest }: any) => rest) })));
    };
    fetchSections();
  }, [selectedTemplateId]);

  const insertSectionsAndItems = async (templateId: string, sectionsData: SectionSuggestion[]) => {
    for (const sec of sectionsData) {
      const { data: secData, error: secErr } = await supabase
        .from("checklist_sections")
        .insert({ template_id: templateId, title: sec.title, sort_order: sec.sort_order, host_user_id: user!.id })
        .select("id")
        .single();
      if (secErr || !secData) continue;

      const itemsToInsert = sec.items.map((item) => ({
        section_id: secData.id,
        label: item.label,
        type: item.type as any,
        required: item.required,
        sort_order: item.sort_order,
        help_text: item.help_text,
        host_user_id: user!.id,
      }));
      await supabase.from("checklist_items").insert(itemsToInsert);
    }
  };

  const createTemplate = async (mode: "empty" | "default" | "ai") => {
    if (!newTemplateName.trim() || !user?.id) return;
    setCreating(true);
    try {
      let aiSections: SectionSuggestion[] | null = null;
      if (mode === "ai") {
        const { data: aiData, error: aiErr } = await supabase.functions.invoke("generate-checklist-suggestions", {
          body: { description: listingDescription.trim() },
        });
        if (aiErr || !aiData?.sections) {
          toast({ title: "AI suggestions failed", description: "Falling back to default suggestions.", variant: "destructive" });
        } else {
          aiSections = aiData.sections;
        }
      }

      const { data: tpl, error: tplErr } = await supabase
        .from("checklist_templates")
        .insert({ name: newTemplateName.trim(), host_user_id: user.id })
        .select("id, name")
        .single();
      if (tplErr || !tpl) throw tplErr;

      if (mode !== "empty") {
        await insertSectionsAndItems(tpl.id, aiSections || DEFAULT_TEMPLATE_SECTIONS);
      }

      const desc = mode === "ai" && aiSections
        ? "AI-generated suggestions based on your description — customize as needed."
        : mode === "default"
        ? "Pre-filled with default items — customize as needed."
        : "Empty template created.";
      toast({ title: "Template created", description: desc });
      setCreateDialogOpen(false);
      setNewTemplateName("");
      setListingDescription("");
      setSelectedTemplateId(tpl.id);
      await fetchTemplates();
      if (!editorOpen) setEditorOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to create template", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const { upcomingTasks, completedTasks } = useMemo(() => {
    const upcoming: any[] = []; const completed: any[] = [];
    for (const task of tasks) {
      if (task.status === "DONE") completed.push(task);
      else if (task.status !== "CANCELLED") upcoming.push(task);
    }
    completed.sort((a, b) => (b.start_at ? new Date(b.start_at).getTime() : 0) - (a.start_at ? new Date(a.start_at).getTime() : 0));
    return { upcomingTasks: upcoming, completedTasks: completed };
  }, [tasks]);

  const TaskCard = ({ task }: { task: any }) => (
    <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/tasks/${task.id}`)}>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{task.listings?.name || "Listing"}{task.reference ? ` · ${task.reference}` : ""}</p>
          <p className="text-xs text-muted-foreground">
            {task.start_at ? format(new Date(task.start_at), "MMM d, HH:mm") : "No date"}
            {task.end_at ? ` – ${format(new Date(task.end_at), "HH:mm")}` : ""}
            {task.nights_to_show != null && ` · ${task.nights_to_show}N`}
            {task.guests_to_show != null ? ` · ${task.guests_to_show}G` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.source === "AUTO" && <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">Auto</span>}
          <StatusBadge status={task.status} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Checklists" description="Cleaning checklists for each scheduled listing task" actions={isHost ? (
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={() => setCreateDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Create Template
          </Button>
          {templates.length > 0 && (
            <Button variant="outline" size="sm" onClick={openEditor} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> Edit Template
            </Button>
          )}
        </div>
      ) : undefined} />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="upcoming">
          <TabsList className="w-full"><TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger><TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger></TabsList>
          <TabsContent value="upcoming" className="space-y-2">{upcomingTasks.length === 0 ? <p className="text-center text-muted-foreground py-8">No upcoming checklists.</p> : upcomingTasks.map((task) => <TaskCard key={task.id} task={task} />)}</TabsContent>
          <TabsContent value="completed" className="space-y-2">{completedTasks.length === 0 ? <p className="text-center text-muted-foreground py-8">No completed checklists yet.</p> : completedTasks.map((task) => <TaskCard key={task.id} task={task} />)}</TabsContent>
        </Tabs>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setNewTemplateName(""); setListingDescription(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Checklist Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="e.g. Standard Cleaning, Deep Clean..." />
            </div>
            <div className="space-y-1.5">
              <Label>Describe your listing <span className="text-muted-foreground font-normal">(for smart suggestions)</span></Label>
              <Textarea
                value={listingDescription}
                onChange={(e) => setListingDescription(e.target.value)}
                placeholder="e.g. Double bedroom with shared bathroom, small kitchen, no garden, balcony with outdoor furniture..."
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {listingDescription.trim().length >= 5
                  ? "✨ AI will generate a tailored checklist based on your description."
                  : "Add a description to get AI-tailored suggestions, or leave empty for generic defaults."}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => createTemplate(listingDescription.trim().length >= 5 ? "ai" : "default")}
              disabled={!newTemplateName.trim() || creating}
              className="w-full gap-1.5"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {listingDescription.trim().length >= 5 ? "Generate Smart Suggestions" : "Use Default Suggestions"}
            </Button>
            <Button variant="outline" onClick={() => createTemplate("empty")} disabled={!newTemplateName.trim() || creating} className="w-full">
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Start Empty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Checklist Template</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            {templates.length > 0 ? (<><Select value={selectedTemplateId || ""} onValueChange={setSelectedTemplateId}><SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger><SelectContent>{templates.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectContent></Select>{selectedTemplateId && <ChecklistTemplateEditor sections={sections} templateId={selectedTemplateId} onSectionsUpdated={setSections} />}</>) : (<div className="text-center py-8 space-y-3"><p className="text-sm text-muted-foreground">No checklist templates found.</p><Button onClick={() => { setEditorOpen(false); setCreateDialogOpen(true); }} className="gap-1.5"><Plus className="h-4 w-4" /> Create Template</Button></div>)}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
