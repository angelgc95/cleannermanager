import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, Save, X, Settings2, AlarmClock, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface ChecklistItem {
  id: string;
  item_key: string | null;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  help_text: string | null;
  timer_minutes: number | null;
  depends_on_item_id: string | null;
}

export interface Section {
  id: string;
  title: string;
  sort_order: number;
  items: ChecklistItem[];
}

interface ChecklistTemplateEditorProps {
  sections: Section[];
  templateId: string;
  onSectionsUpdated: (sections: Section[]) => void;
}

export function ChecklistTemplateEditor({ sections, templateId, onSectionsUpdated }: ChecklistTemplateEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [editingSection, setEditingSection] = useState<{ id: string; title: string } | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem & { sectionId: string } | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionDescription, setNewSectionDescription] = useState("");
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [generatingItems, setGeneratingItems] = useState(false);
  const [addingItemToSection, setAddingItemToSection] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemType, setNewItemType] = useState("YESNO");
  const [newItemRequired, setNewItemRequired] = useState(true);
  const [newItemHelpText, setNewItemHelpText] = useState("");
  const [newItemTimerMinutes, setNewItemTimerMinutes] = useState<string>("");
  const [newItemDependsOn, setNewItemDependsOn] = useState<string>("");

  // Get items from the current section for dependency dropdown (exclude TIMER items)
  const getSectionItemsForDependency = (sectionId: string, excludeItemId?: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return [];
    return section.items.filter(i => i.type !== "TIMER" && i.id !== excludeItemId);
  };

  // --- Section CRUD ---
  const addSection = async (withAI: boolean = false) => {
    if (!newSectionTitle.trim()) return;
    const maxSort = Math.max(0, ...sections.map((s) => s.sort_order));
    
    // If AI mode, generate items first
    let aiItems: { label: string; type: string; required: boolean; sort_order: number; help_text: string | null }[] = [];
    if (withAI && newSectionDescription.trim().length >= 5) {
      setGeneratingItems(true);
      try {
        const { data: aiData, error: aiErr } = await supabase.functions.invoke("generate-checklist-suggestions", {
          body: { description: newSectionDescription.trim(), mode: "section", section_title: newSectionTitle.trim() },
        });
        if (aiErr || !aiData?.items) {
          toast({ title: "AI suggestions failed", description: "Section created without items.", variant: "destructive" });
        } else {
          aiItems = aiData.items;
        }
      } catch {
        toast({ title: "AI suggestions failed", description: "Section created without items.", variant: "destructive" });
      } finally {
        setGeneratingItems(false);
      }
    }

    const { data, error } = await supabase
      .from("checklist_sections")
      .insert({ template_id: templateId, title: newSectionTitle.trim(), sort_order: maxSort + 1, host_user_id: user?.id })
      .select("id, title, sort_order")
      .single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // Insert AI-generated items if any
    let insertedItems: ChecklistItem[] = [];
    if (aiItems.length > 0) {
      const itemsToInsert = aiItems.map((item) => ({
        section_id: data.id,
        label: item.label,
        type: item.type as any,
        required: item.required,
        sort_order: item.sort_order,
        help_text: item.help_text,
        host_user_id: user?.id,
      }));
      const { data: itemsData, error: itemsErr } = await supabase
        .from("checklist_items")
        .insert(itemsToInsert)
        .select("id, item_key, label, type, required, sort_order, help_text, timer_minutes, depends_on_item_id");
      if (!itemsErr && itemsData) {
        insertedItems = itemsData as ChecklistItem[];
      }
    }

    onSectionsUpdated([...sections, { ...data, items: insertedItems }]);
    setNewSectionTitle("");
    setNewSectionDescription("");
    setAddingSectionOpen(false);
    const desc = aiItems.length > 0
      ? `Section added with ${aiItems.length} AI-suggested items.`
      : "Section added";
    toast({ title: desc });
  };

  const updateSectionTitle = async () => {
    if (!editingSection) return;
    const { error } = await supabase.from("checklist_sections").update({ title: editingSection.title }).eq("id", editingSection.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated(sections.map((s) => s.id === editingSection.id ? { ...s, title: editingSection.title } : s));
    setEditingSection(null);
    toast({ title: "Section renamed" });
  };

  const deleteSection = async (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (section && section.items.length > 0) {
      toast({ title: "Cannot delete", description: "Remove all items first.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("checklist_sections").delete().eq("id", sectionId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated(sections.filter((s) => s.id !== sectionId));
    toast({ title: "Section deleted" });
  };

  // --- Item CRUD ---
  const addItem = async () => {
    if (!addingItemToSection || !newItemLabel.trim()) return;
    const section = sections.find((s) => s.id === addingItemToSection);
    const maxSort = Math.max(0, ...(section?.items.map((i) => i.sort_order) || [0]));
    const isTimer = newItemType === "TIMER";
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({
        section_id: addingItemToSection,
        label: newItemLabel.trim(),
        type: newItemType as any,
        required: isTimer ? false : newItemRequired,
        help_text: newItemHelpText.trim() || null,
        timer_minutes: isTimer && newItemTimerMinutes ? parseInt(newItemTimerMinutes) : null,
        depends_on_item_id: isTimer && newItemDependsOn ? newItemDependsOn : null,
        sort_order: maxSort + 1,
        host_user_id: user?.id,
      })
      .select("id, item_key, label, type, required, sort_order, help_text, timer_minutes, depends_on_item_id")
      .single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated(
      sections.map((s) => s.id === addingItemToSection ? { ...s, items: [...s.items, data as ChecklistItem] } : s)
    );
    resetItemForm();
    toast({ title: "Item added" });
  };

  const updateItem = async () => {
    if (!editingItem) return;
    const { sectionId, ...item } = editingItem;
    const isTimer = item.type === "TIMER";
    const { error } = await supabase.from("checklist_items").update({
      label: item.label,
      type: item.type as any,
      required: isTimer ? false : item.required,
      help_text: item.help_text,
      timer_minutes: isTimer ? item.timer_minutes : null,
      depends_on_item_id: isTimer ? item.depends_on_item_id : null,
    }).eq("id", item.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated(
      sections.map((s) => s.id === sectionId
        ? { ...s, items: s.items.map((i) => i.id === item.id ? { ...i, ...item } : i) }
        : s
      )
    );
    setEditingItem(null);
    toast({ title: "Item updated" });
  };

  const deleteItem = async (sectionId: string, itemId: string) => {
    const { error } = await supabase.from("checklist_items").delete().eq("id", itemId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated(
      sections.map((s) => s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s)
    );
    toast({ title: "Item removed" });
  };

  const resetItemForm = () => {
    setAddingItemToSection(null);
    setNewItemLabel("");
    setNewItemType("YESNO");
    setNewItemRequired(true);
    setNewItemHelpText("");
    setNewItemTimerMinutes("");
    setNewItemDependsOn("");
  };

  // Current type for the dialog
  const currentType = editingItem ? editingItem.type : newItemType;
  const isTimerType = currentType === "TIMER";
  const currentSectionId = editingItem ? editingItem.sectionId : addingItemToSection;
  const dependencyItems = currentSectionId ? getSectionItemsForDependency(currentSectionId, editingItem?.id) : [];

  if (!editMode) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5">
        <Settings2 className="h-3.5 w-3.5" /> Edit Template
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Template Editor</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddingSectionOpen(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Section
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sections.map((section) => (
        <Card key={section.id} className="border-muted">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              {editingSection?.id === section.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editingSection.title}
                    onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })}
                    className="h-8 text-sm flex-1"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={updateSectionTitle}>
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingSection(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{section.title}</p>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingSection({ id: section.id, title: section.title })}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteSection(section.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {section.items.map((item) => {
              const depItem = item.depends_on_item_id ? section.items.find(i => i.id === item.depends_on_item_id) : null;
              return (
                <div key={item.id} className="flex items-center gap-2 pl-3 py-1 border-l-2 border-muted text-sm">
                  <span className="flex-1 truncate">
                    {item.type === "TIMER" && <AlarmClock className="h-3 w-3 inline mr-1 text-primary" />}
                    {item.label}
                    <span className="text-xs text-muted-foreground ml-1">({item.type})</span>
                    {item.required && <span className="text-destructive ml-0.5">*</span>}
                    {item.type === "TIMER" && item.timer_minutes && (
                      <span className="text-xs text-muted-foreground ml-1">⏰ {item.timer_minutes}min</span>
                    )}
                    {item.type === "TIMER" && depItem && (
                      <span className="text-xs text-muted-foreground ml-1">→ {depItem.label}</span>
                    )}
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingItem({ ...item, sectionId: section.id })}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteItem(section.id, item.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}

            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs w-full justify-start text-muted-foreground"
              onClick={() => { resetItemForm(); setAddingItemToSection(section.id); }}
            >
              <Plus className="h-3 w-3" /> Add item
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* Add Section Dialog */}
      <Dialog open={addingSectionOpen} onOpenChange={(open) => { setAddingSectionOpen(open); if (!open) { setNewSectionTitle(""); setNewSectionDescription(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Section Title</Label>
              <Input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="e.g. Kitchen, Bathroom, Outdoor..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Describe this section <span className="text-muted-foreground font-normal">(for smart suggestions)</span></Label>
              <Textarea
                value={newSectionDescription}
                onChange={(e) => setNewSectionDescription(e.target.value)}
                placeholder="e.g. Large kitchen with dishwasher, gas oven, coffee machine, and breakfast bar..."
                rows={3}
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                {newSectionDescription.trim().length >= 5
                  ? "✨ AI will suggest items tailored to your description."
                  : "Add a description to get AI-tailored suggestions, or leave empty to add items manually."}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => addSection(newSectionDescription.trim().length >= 5)}
              disabled={!newSectionTitle.trim() || generatingItems}
              className="w-full gap-1.5"
            >
              {generatingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : newSectionDescription.trim().length >= 5 ? <Sparkles className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {generatingItems ? "Generating..." : newSectionDescription.trim().length >= 5 ? "Add with Smart Suggestions" : "Add Empty Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Item Dialog */}
      <Dialog open={!!addingItemToSection || !!editingItem} onOpenChange={(open) => { if (!open) { resetItemForm(); setEditingItem(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={currentType}
                onValueChange={(v) => {
                  if (editingItem) {
                    setEditingItem({ ...editingItem, type: v, timer_minutes: v === "TIMER" ? editingItem.timer_minutes : null, depends_on_item_id: v === "TIMER" ? editingItem.depends_on_item_id : null });
                  } else {
                    setNewItemType(v);
                    if (v !== "TIMER") { setNewItemTimerMinutes(""); setNewItemDependsOn(""); }
                  }
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YESNO">Yes/No</SelectItem>
                  <SelectItem value="PHOTO">Photo</SelectItem>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="NUMBER">Number</SelectItem>
                  <SelectItem value="TIMER">⏰ Timer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={editingItem ? editingItem.label : newItemLabel}
                onChange={(e) => editingItem ? setEditingItem({ ...editingItem, label: e.target.value }) : setNewItemLabel(e.target.value)}
                placeholder={isTimerType ? "e.g. Washing machine cycle" : "Item label..."}
              />
            </div>

            {isTimerType && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Duration (minutes)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editingItem ? (editingItem.timer_minutes ?? "") : newItemTimerMinutes}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (editingItem) {
                        setEditingItem({ ...editingItem, timer_minutes: val ? parseInt(val) : null });
                      } else {
                        setNewItemTimerMinutes(val);
                      }
                    }}
                    placeholder="e.g. 60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Starts when this item is done</Label>
                  <Select
                    value={editingItem ? (editingItem.depends_on_item_id || "") : newItemDependsOn}
                    onValueChange={(v) => {
                      if (editingItem) {
                        setEditingItem({ ...editingItem, depends_on_item_id: v || null });
                      } else {
                        setNewItemDependsOn(v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select trigger item..." /></SelectTrigger>
                    <SelectContent>
                      {dependencyItems.map(dep => (
                        <SelectItem key={dep.id} value={dep.id}>{dep.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Timer auto-starts when the selected item is marked done. At 0 a persistent alarm shows.</p>
                </div>
              </>
            )}

            {!isTimerType && (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingItem ? editingItem.required : newItemRequired}
                    onCheckedChange={(v) => editingItem ? setEditingItem({ ...editingItem, required: v }) : setNewItemRequired(v)}
                  />
                  <Label className="text-xs">Required</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Help text (optional)</Label>
                  <Input
                    value={editingItem ? (editingItem.help_text || "") : newItemHelpText}
                    onChange={(e) => editingItem ? setEditingItem({ ...editingItem, help_text: e.target.value || null }) : setNewItemHelpText(e.target.value)}
                    placeholder="Help text..."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetItemForm(); setEditingItem(null); }}>Cancel</Button>
            <Button
              onClick={editingItem ? updateItem : addItem}
              disabled={
                editingItem
                  ? !editingItem.label.trim() || (editingItem.type === "TIMER" && (!editingItem.timer_minutes || !editingItem.depends_on_item_id))
                  : !newItemLabel.trim() || (newItemType === "TIMER" && (!newItemTimerMinutes || !newItemDependsOn))
              }
            >
              {editingItem ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
