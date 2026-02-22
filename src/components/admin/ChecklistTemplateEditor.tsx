import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, Save, X, GripVertical, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface ChecklistItem {
  id: string;
  item_key: string | null;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  help_text: string | null;
}

interface Section {
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
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [addingItemToSection, setAddingItemToSection] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemType, setNewItemType] = useState("YESNO");
  const [newItemRequired, setNewItemRequired] = useState(true);
  const [newItemHelpText, setNewItemHelpText] = useState("");

  // --- Section CRUD ---
  const addSection = async () => {
    if (!newSectionTitle.trim()) return;
    const maxSort = Math.max(0, ...sections.map((s) => s.sort_order));
    const { data, error } = await supabase
      .from("checklist_sections")
      .insert({ template_id: templateId, title: newSectionTitle.trim(), sort_order: maxSort + 1, host_user_id: user?.id })
      .select("id, title, sort_order")
      .single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated([...sections, { ...data, items: [] }]);
    setNewSectionTitle("");
    setAddingSectionOpen(false);
    toast({ title: "Section added" });
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
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({
        section_id: addingItemToSection,
        label: newItemLabel.trim(),
        type: newItemType as any,
        required: newItemRequired,
        help_text: newItemHelpText.trim() || null,
        sort_order: maxSort + 1,
        host_user_id: user?.id,
      })
      .select("id, item_key, label, type, required, sort_order, help_text")
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
    const { error } = await supabase.from("checklist_items").update({
      label: item.label,
      type: item.type as any,
      required: item.required,
      help_text: item.help_text,
    }).eq("id", item.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    onSectionsUpdated(
      sections.map((s) => s.id === sectionId
        ? { ...s, items: s.items.map((i) => i.id === item.id ? { ...i, label: item.label, type: item.type, required: item.required, help_text: item.help_text } : i) }
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
  };

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

            {section.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 pl-3 py-1 border-l-2 border-muted text-sm">
                <span className="flex-1 truncate">
                  {item.label}
                  <span className="text-xs text-muted-foreground ml-1">({item.type})</span>
                  {item.required && <span className="text-destructive ml-0.5">*</span>}
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingItem({ ...item, sectionId: section.id })}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteItem(section.id, item.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

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
      <Dialog open={addingSectionOpen} onOpenChange={setAddingSectionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
          <Input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="Section title..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingSectionOpen(false)}>Cancel</Button>
            <Button onClick={addSection} disabled={!newSectionTitle.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Item Dialog */}
      <Dialog open={!!addingItemToSection || !!editingItem} onOpenChange={(open) => { if (!open) { resetItemForm(); setEditingItem(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={editingItem ? editingItem.label : newItemLabel}
                onChange={(e) => editingItem ? setEditingItem({ ...editingItem, label: e.target.value }) : setNewItemLabel(e.target.value)}
                placeholder="Item label..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={editingItem ? editingItem.type : newItemType}
                onValueChange={(v) => editingItem ? setEditingItem({ ...editingItem, type: v }) : setNewItemType(v)}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YESNO">Yes/No</SelectItem>
                  <SelectItem value="PHOTO">Photo</SelectItem>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="NUMBER">Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetItemForm(); setEditingItem(null); }}>Cancel</Button>
            <Button onClick={editingItem ? updateItem : addItem} disabled={editingItem ? !editingItem.label.trim() : !newItemLabel.trim()}>
              {editingItem ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
