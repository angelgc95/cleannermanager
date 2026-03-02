import { useEffect, useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Settings2, Plus, Loader2, Sparkles, Save, Check, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChecklistTemplateEditor } from "@/components/admin/ChecklistTemplateEditor";
import type { Section } from "@/components/admin/ChecklistTemplateEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface TemplateOption { id: string; name: string; }
interface ListingOption { id: string; name: string; default_checklist_template_id: string | null; }

interface SectionSuggestion {
  title: string;
  sort_order: number;
  items: { label: string; type: string; required: boolean; sort_order: number; help_text: string | null; timer_minutes?: number | null; }[];
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
  const [events, setEvents] = useState<any[]>([]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, user } = useAuth();
  const { toast } = useToast();
  const isHost = role === "host";
  const [manageOpen, setManageOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [assigningListing, setAssigningListing] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string | null>>({});
  const [saved, setSaved] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);

  // Auto-open manage sheet from query param (e.g. from Settings)
  useEffect(() => {
    if (searchParams.get("manage") === "1") {
      setManageOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("cleaning_events")
        .select("*, listings(name)")
        .order("start_at", { ascending: true })
        .limit(200);
      setEvents(data || []);
    };
    fetch();
  }, []);

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from("checklist_templates").select("id, name").eq("active", true).order("name");
    const tpls = data || [];
    setTemplates(tpls);
    return tpls;
  }, []);

  const fetchListings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("listings").select("id, name, default_checklist_template_id").eq("host_user_id", user.id).order("name");
    setListings((data || []) as ListingOption[]);
  }, [user]);

  const handleSaveAssignments = async () => {
    if (!selectedTemplateId) return;
    setAssigningListing(true);
    setSaved(false);
    try {
      for (const [listingId, templateId] of Object.entries(pendingAssignments)) {
        await supabase
          .from("listings")
          .update({ default_checklist_template_id: templateId } as any)
          .eq("id", listingId);
      }
      await fetchListings();
      setPendingAssignments({});
      setSaved(true);
      toast({ title: "Saved", description: "Listing assignments updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setAssigningListing(false);
    }
  };

  const openEditor = useCallback(async (templateId?: string) => {
    setManageOpen(true);
    setSaved(false);
    setPendingAssignments({});
    const tpls = await fetchTemplates();
    fetchListings();
    if (templateId) {
      setSelectedTemplateId(templateId);
    } else if (tpls.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(tpls[0].id);
    }
  }, [selectedTemplateId, fetchTemplates, fetchListings]);

  useEffect(() => {
    if (!selectedTemplateId) { setSections([]); return; }
    const fetchSections = async () => {
      const { data } = await supabase.from("checklist_sections").select("id, title, sort_order").eq("template_id", selectedTemplateId).order("sort_order");
      const secs = data || [];
      if (secs.length === 0) { setSections([]); return; }
      const { data: items } = await supabase.from("checklist_items").select("id, item_key, label, type, required, sort_order, help_text, section_id, timer_minutes, depends_on_item_id").in("section_id", secs.map((s) => s.id)).order("sort_order");
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
      if (!manageOpen) setManageOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to create template", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const { upcomingEvents, completedEvents } = useMemo(() => {
    const upcoming: any[] = []; const completed: any[] = [];
    for (const ev of events) {
      if (ev.status === "DONE") completed.push(ev);
      else if (ev.status !== "CANCELLED") upcoming.push(ev);
    }
    completed.sort((a, b) => (b.start_at ? new Date(b.start_at).getTime() : 0) - (a.start_at ? new Date(a.start_at).getTime() : 0));
    return { upcomingEvents: upcoming, completedEvents: completed };
  }, [events]);

  const details = (ev: any) => ev.event_details_json || {};

  const EventCard = ({ event }: { event: any }) => (
    <Card key={event.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/events/${event.id}`)}>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{event.listings?.name || "Listing"}{event.reference ? ` · ${event.reference}` : ""}</p>
          <p className="text-xs text-muted-foreground">
            {event.start_at ? format(new Date(event.start_at), "MMM d, HH:mm") : "No date"}
            {event.end_at ? ` – ${format(new Date(event.end_at), "HH:mm")}` : ""}
            {details(event).nights != null && ` · ${details(event).nights}N`}
            {details(event).guests != null ? ` · ${details(event).guests}G` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {event.source === "AUTO" && <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">Auto</span>}
          <StatusBadge status={event.status} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Checklists" description="Cleaning checklists for each scheduled event" actions={isHost ? (
        <Button variant="outline" size="sm" onClick={() => openEditor()} className="gap-1.5">
          <Settings2 className="h-4 w-4" /> Manage Templates
        </Button>
      ) : undefined} />
      <div className="p-6 space-y-4">
        <Tabs defaultValue="upcoming">
          <TabsList className="w-full"><TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger><TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger></TabsList>
          <TabsContent value="upcoming" className="space-y-2">{upcomingEvents.length === 0 ? <p className="text-center text-muted-foreground py-8">No upcoming checklists.</p> : upcomingEvents.map((ev) => <EventCard key={ev.id} event={ev} />)}</TabsContent>
          <TabsContent value="completed" className="space-y-2">{completedEvents.length === 0 ? <p className="text-center text-muted-foreground py-8">No completed checklists yet.</p> : completedEvents.map((ev) => <EventCard key={ev.id} event={ev} />)}</TabsContent>
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

      {/* Manage Templates Sheet */}
      <Sheet open={manageOpen} onOpenChange={(open) => { setManageOpen(open); if (!open) { setEditingTemplate(false); setTemplateDirty(false); } }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Manage Templates</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
              <div className="flex items-center gap-2">
                {selectedTemplateId && sections.length > 0 && !editingTemplate && (
                  <Button size="sm" variant="outline" onClick={() => { setEditingTemplate(true); setTemplateDirty(false); }} className="gap-1.5">
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                )}
                {editingTemplate && (
                  <Button size="sm" variant={templateDirty ? "default" : "outline"} disabled={!templateDirty} onClick={() => { setEditingTemplate(false); setTemplateDirty(false); toast({ title: "Template saved" }); }} className="gap-1.5">
                    <Save className="h-4 w-4" /> Save
                  </Button>
                )}
                <Button size="sm" onClick={() => { setCreateDialogOpen(true); }} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Create Template
                </Button>
              </div>
            </div>
             {templates.length > 0 ? (
              <>
                <Select value={selectedTemplateId || ""} onValueChange={(v) => { setSelectedTemplateId(v); setPendingAssignments({}); setSaved(false); setEditingTemplate(false); setTemplateDirty(false); }}>
                  <SelectTrigger><SelectValue placeholder="Select template to edit" /></SelectTrigger>
                  <SelectContent>{templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}</SelectContent>
                </Select>

                {selectedTemplateId && (
                  <div className="space-y-3">
                    {/* Assign to Listings */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Assigned Listings</Label>
                      <div className="space-y-1.5 rounded-md border border-border p-2">
                        {listings.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 text-center">No listings found.</p>
                        ) : listings.map((l) => {
                          const currentTemplateId = pendingAssignments.hasOwnProperty(l.id)
                            ? pendingAssignments[l.id]
                            : l.default_checklist_template_id;
                          const isAssigned = currentTemplateId === selectedTemplateId;
                          const otherTpl = !isAssigned && currentTemplateId
                            ? templates.find(t => t.id === currentTemplateId)
                            : null;
                          return (
                            <label key={l.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={(e) => {
                                  setPendingAssignments(prev => ({
                                    ...prev,
                                    [l.id]: e.target.checked ? selectedTemplateId : null,
                                  }));
                                  setSaved(false);
                                }}
                                className="rounded border-border"
                              />
                              <span className="flex-1">{l.name}</span>
                              {otherTpl && (
                                <span className="text-xs text-muted-foreground">using: {otherTpl.name}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {Object.keys(pendingAssignments).length > 0 && !saved && (
                        <Button size="sm" onClick={handleSaveAssignments} disabled={assigningListing} className="w-full gap-1.5">
                          {assigningListing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save Assignments
                        </Button>
                      )}

                      {saved && (
                        <p className="text-xs text-[hsl(var(--status-done))] flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Assignments saved successfully.
                        </p>
                      )}
                    </div>

                    {(() => {
                      const assignedListingIds = listings.filter(l => l.default_checklist_template_id).map(l => l.id);
                      const unassigned = listings.filter(l => !assignedListingIds.includes(l.id));
                      if (unassigned.length === 0) return null;
                      return (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">⚠ Listings without any template:</p>
                          <ul className="text-xs text-amber-600 dark:text-amber-500 mt-1 space-y-0.5">
                            {unassigned.map(l => <li key={l.id}>• {l.name}</li>)}
                          </ul>
                        </div>
                      );
                    })()}

                    {editingTemplate ? (
                      <ChecklistTemplateEditor sections={sections} templateId={selectedTemplateId} onSectionsUpdated={(s) => { setSections(s); setTemplateDirty(true); }} />
                    ) : sections.length > 0 ? (
                      <div className="space-y-3">
                        {sections.map((section) => (
                          <div key={section.id} className="rounded-md border border-border">
                            <div className="bg-muted/30 px-3 py-2 border-b border-border">
                              <p className="text-sm font-medium">{section.title}</p>
                            </div>
                            <ul className="divide-y divide-border">
                              {section.items.map((item) => (
                                <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.type}</span>
                                  <span className="flex-1">{item.label}</span>
                                  {item.timer_minutes && item.timer_minutes > 0 && (
                                    <span className="text-xs text-muted-foreground">⏰ {item.timer_minutes}m</span>
                                  )}
                                  {item.required && <span className="text-xs text-destructive">*</span>}
                                </li>
                              ))}
                              {section.items.length === 0 && (
                                <li className="px-3 py-2 text-xs text-muted-foreground italic">No items in this section</li>
                              )}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">This template has no sections yet. Click Edit to add some.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No templates yet. Create one to get started.</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
