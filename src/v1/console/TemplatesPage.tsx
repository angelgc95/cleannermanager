import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Listing = { id: string; name: string };
type Template = { id: string; name: string; listing_id: string; active: boolean };
type Item = { id: string; template_id: string; label: string; required: boolean; photo_required: boolean; fail_requires_comment: boolean; sort_order: number };

export default function TemplatesPage() {
  const { organizationId } = useAuth();

  const [listings, setListings] = useState<Listing[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [listingId, setListingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const [itemLabel, setItemLabel] = useState("");
  const [required, setRequired] = useState(true);
  const [photoRequired, setPhotoRequired] = useState(false);
  const [commentOnFail, setCommentOnFail] = useState(true);

  const load = async () => {
    if (!organizationId) return;

    const [{ data: listingRows }, { data: templateRows }] = await Promise.all([
      db.from("v1_listings").select("id, name").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_checklist_templates").select("id, name, listing_id, active").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);

    const templatesData = (templateRows || []) as Template[];
    setListings((listingRows || []) as Listing[]);
    setTemplates(templatesData);

    const selectedTemplate = activeTemplateId || templatesData[0]?.id || null;
    setActiveTemplateId(selectedTemplate);

    if (selectedTemplate) {
      const { data: itemRows } = await db
        .from("v1_checklist_template_items")
        .select("id, template_id, label, required, photo_required, fail_requires_comment, sort_order")
        .eq("template_id", selectedTemplate)
        .order("sort_order", { ascending: true });
      setItems((itemRows || []) as Item[]);
    } else {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  useEffect(() => {
    if (!activeTemplateId) {
      setItems([]);
      return;
    }
    db
      .from("v1_checklist_template_items")
      .select("id, template_id, label, required, photo_required, fail_requires_comment, sort_order")
      .eq("template_id", activeTemplateId)
      .order("sort_order", { ascending: true })
      .then(({ data }: any) => setItems((data || []) as Item[]));
  }, [activeTemplateId]);

  const createTemplate = async () => {
    if (!organizationId || !listingId || !templateName.trim()) return;
    const { data } = await db
      .from("v1_checklist_templates")
      .insert({
        organization_id: organizationId,
        listing_id: listingId,
        name: templateName.trim(),
        active: true,
      })
      .select("id")
      .single();

    setTemplateName("");
    setActiveTemplateId(data?.id || null);
    await load();
  };

  const addItem = async () => {
    if (!organizationId || !activeTemplateId || !itemLabel.trim()) return;

    await db.from("v1_checklist_template_items").insert({
      organization_id: organizationId,
      template_id: activeTemplateId,
      label: itemLabel.trim(),
      required,
      photo_required: photoRequired,
      fail_requires_comment: commentOnFail,
      sort_order: items.length,
    });

    setItemLabel("");
    setRequired(true);
    setPhotoRequired(false);
    setCommentOnFail(true);

    const { data } = await db
      .from("v1_checklist_template_items")
      .select("id, template_id, label, required, photo_required, fail_requires_comment, sort_order")
      .eq("template_id", activeTemplateId)
      .order("sort_order", { ascending: true });
    setItems((data || []) as Item[]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader><CardTitle>Create Template</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Listing</Label>
            <Select value={listingId || ""} onValueChange={setListingId}>
              <SelectTrigger><SelectValue placeholder="Select listing" /></SelectTrigger>
              <SelectContent>
                {listings.map((listing) => <SelectItem key={listing.id} value={listing.id}>{listing.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Template Name</Label>
            <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Turnover Default" />
          </div>
          <Button onClick={createTemplate} className="w-full" disabled={!listingId || !templateName.trim()}>Create Template</Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setActiveTemplateId(template.id)}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${activeTemplateId === template.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-xs text-muted-foreground">Listing: {template.listing_id}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Template Items</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Item label</Label>
              <Input value={itemLabel} onChange={(event) => setItemLabel(event.target.value)} placeholder="Take photo of kitchen sink" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={required} onCheckedChange={(value) => setRequired(!!value)} /> Required</label>
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={photoRequired} onCheckedChange={(value) => setPhotoRequired(!!value)} /> Photo required</label>
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={commentOnFail} onCheckedChange={(value) => setCommentOnFail(!!value)} /> Comment on fail</label>
            </div>
            <Button onClick={addItem} disabled={!activeTemplateId || !itemLabel.trim()}>Add Item</Button>

            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded border border-border px-3 py-2 text-sm">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.required ? "Required" : "Optional"} · {item.photo_required ? "Photo required" : "No photo"} · {item.fail_requires_comment ? "Fail comment required" : "Fail comment optional"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
