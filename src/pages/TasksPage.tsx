import { useEffect, useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Settings2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChecklistTemplateEditor } from "@/components/admin/ChecklistTemplateEditor";

interface TemplateOption { id: string; name: string; }
interface Section { id: string; title: string; sort_order: number; items: { id: string; item_key: string | null; label: string; type: string; required: boolean; sort_order: number; help_text: string | null; }[]; }

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();
  const { role } = useAuth();
  const isHost = role === "host";
  const [editorOpen, setEditorOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);

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

  const openEditor = useCallback(async () => {
    setEditorOpen(true);
    const { data } = await supabase.from("checklist_templates").select("id, name").eq("active", true).order("name");
    const tpls = data || [];
    setTemplates(tpls);
    if (tpls.length > 0 && !selectedTemplateId) setSelectedTemplateId(tpls[0].id);
  }, [selectedTemplateId]);

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
          <p className="font-medium text-sm truncate">{task.listings?.name || "Listing"}</p>
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
      <PageHeader title="Checklists" description="Cleaning checklists for each scheduled listing task" actions={isHost ? (<Button variant="outline" size="sm" onClick={openEditor} className="gap-1.5"><Settings2 className="h-4 w-4" /> Edit Template</Button>) : undefined} />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="upcoming">
          <TabsList className="w-full"><TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger><TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger></TabsList>
          <TabsContent value="upcoming" className="space-y-2">{upcomingTasks.length === 0 ? <p className="text-center text-muted-foreground py-8">No upcoming checklists.</p> : upcomingTasks.map((task) => <TaskCard key={task.id} task={task} />)}</TabsContent>
          <TabsContent value="completed" className="space-y-2">{completedTasks.length === 0 ? <p className="text-center text-muted-foreground py-8">No completed checklists yet.</p> : completedTasks.map((task) => <TaskCard key={task.id} task={task} />)}</TabsContent>
        </Tabs>
      </div>
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Checklist Template</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            {templates.length > 0 ? (<><Select value={selectedTemplateId || ""} onValueChange={setSelectedTemplateId}><SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger><SelectContent>{templates.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectContent></Select>{selectedTemplateId && <ChecklistTemplateEditor sections={sections} templateId={selectedTemplateId} onSectionsUpdated={setSections} />}</>) : (<p className="text-sm text-muted-foreground text-center py-8">No checklist templates found.</p>)}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
