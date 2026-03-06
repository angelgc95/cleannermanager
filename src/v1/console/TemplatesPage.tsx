import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Listing = { id: string; name: string; unit_id: string };
type Unit = { id: string; name: string; type: string };
type Template = { id: string; name: string; listing_id: string; active: boolean };
type Item = {
  id: string;
  template_id: string;
  label: string;
  required: boolean;
  photo_required: boolean;
  fail_requires_comment: boolean;
  sort_order: number;
};
type BulkResult = {
  dry_run: boolean;
  batch_id: string | null;
  summary: {
    units_total: number;
    units_updated: number;
    listings_total: number;
    listings_assigned: number;
    listings_skipped: number;
  };
  affected_listings: Array<{
    listing_id: string;
    listing_name: string;
    action: "ASSIGNED" | "SKIPPED";
    notes: string;
  }>;
};

export default function TemplatesPage() {
  const { organizationId } = useAuth();

  const [listings, setListings] = useState<Listing[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [listingId, setListingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const [bulkUnitId, setBulkUnitId] = useState<string | null>(null);
  const [bulkTemplateId, setBulkTemplateId] = useState<string | null>(null);
  const [bulkIncludeDescendants, setBulkIncludeDescendants] = useState(true);
  const [bulkDryRun, setBulkDryRun] = useState(true);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const [itemLabel, setItemLabel] = useState("");
  const [required, setRequired] = useState(true);
  const [photoRequired, setPhotoRequired] = useState(false);
  const [commentOnFail, setCommentOnFail] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const listingNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const listing of listings) {
      map[listing.id] = listing.name;
    }
    return map;
  }, [listings]);

  const loadItems = async (templateId: string | null) => {
    if (!templateId) {
      setItems([]);
      return;
    }

    const { data: itemRows } = await db
      .from("v1_checklist_template_items")
      .select("id, template_id, label, required, photo_required, fail_requires_comment, sort_order")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true });

    setItems((itemRows || []) as Item[]);
  };

  const load = async () => {
    if (!organizationId) return;

    const [{ data: listingRows }, { data: unitRows }, { data: templateRows }] = await Promise.all([
      db.from("v1_listings").select("id, name, unit_id").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_org_units").select("id, name, type").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_checklist_templates").select("id, name, listing_id, active").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);

    const nextTemplates = (templateRows || []) as Template[];
    setListings((listingRows || []) as Listing[]);
    setUnits((unitRows || []) as Unit[]);
    setTemplates(nextTemplates);

    const nextActiveTemplateId = activeTemplateId && nextTemplates.some((template) => template.id === activeTemplateId)
      ? activeTemplateId
      : nextTemplates[0]?.id || null;

    setActiveTemplateId(nextActiveTemplateId);
    if (!bulkTemplateId && nextTemplates[0]?.id) {
      setBulkTemplateId(nextTemplates[0].id);
    }

    await loadItems(nextActiveTemplateId);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  useEffect(() => {
    loadItems(activeTemplateId);
  }, [activeTemplateId]);

  const createTemplate = async () => {
    if (!organizationId || !listingId || !templateName.trim()) return;

    setStatusMessage(null);
    const { data, error } = await db
      .from("v1_checklist_templates")
      .insert({
        organization_id: organizationId,
        listing_id: listingId,
        name: templateName.trim(),
        active: true,
      })
      .select("id")
      .single();

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setTemplateName("");
    setActiveTemplateId(data?.id || null);
    setBulkTemplateId(data?.id || bulkTemplateId);
    setStatusMessage("Template created.");
    await load();
  };

  const addItem = async () => {
    if (!organizationId || !activeTemplateId || !itemLabel.trim()) return;

    const { error } = await db.from("v1_checklist_template_items").insert({
      organization_id: organizationId,
      template_id: activeTemplateId,
      label: itemLabel.trim(),
      required,
      photo_required: photoRequired,
      fail_requires_comment: commentOnFail,
      sort_order: items.length,
    });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setItemLabel("");
    setRequired(true);
    setPhotoRequired(false);
    setCommentOnFail(true);
    setStatusMessage("Item added.");
    await loadItems(activeTemplateId);
  };

  const runBulkApply = async () => {
    if (!organizationId || !bulkUnitId || !bulkTemplateId) return;

    setBulkSubmitting(true);
    setStatusMessage(null);

    const { data, error } = await db.functions.invoke("bulk-assign-templates-v1", {
      body: {
        organization_id: organizationId,
        unit_id: bulkUnitId,
        template_id: bulkTemplateId,
        include_descendants: bulkIncludeDescendants,
        dry_run: bulkDryRun,
      },
    });

    setBulkSubmitting(false);

    if (error || data?.error) {
      setStatusMessage(error?.message || data?.error || "Bulk template apply failed.");
      return;
    }

    setBulkResult(data as BulkResult);
    setStatusMessage(bulkDryRun ? "Bulk template dry run complete." : "Bulk template apply completed.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <div className="space-y-6">
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

            <Button onClick={createTemplate} className="w-full" disabled={!listingId || !templateName.trim()}>
              Create Template
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bulk Apply Template</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={bulkUnitId || ""} onValueChange={setBulkUnitId}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Template</Label>
              <Select value={bulkTemplateId || ""} onValueChange={setBulkTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} · {listingNameById[template.listing_id] || template.listing_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Include descendant units</span>
                <Checkbox checked={bulkIncludeDescendants} onCheckedChange={(value) => setBulkIncludeDescendants(value === true)} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Dry run</span>
                <Checkbox checked={bulkDryRun} onCheckedChange={(value) => setBulkDryRun(value === true)} />
              </label>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={runBulkApply}
              disabled={!bulkUnitId || !bulkTemplateId || bulkSubmitting}
            >
              {bulkSubmitting ? "Running..." : bulkDryRun ? "Run Dry Run" : "Apply Template"}
            </Button>

            {bulkResult && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={bulkResult.dry_run ? "outline" : "default"}>
                    {bulkResult.dry_run ? "Dry Run" : "Applied"}
                  </Badge>
                  {bulkResult.batch_id && <Badge variant="secondary">Batch Logged</Badge>}
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>Units in scope: <span className="font-medium">{bulkResult.summary.units_total}</span></div>
                  <div>Units updated: <span className="font-medium">{bulkResult.summary.units_updated}</span></div>
                  <div>Listings in scope: <span className="font-medium">{bulkResult.summary.listings_total}</span></div>
                  <div>Listings changed: <span className="font-medium">{bulkResult.summary.listings_assigned}</span></div>
                  <div>Listings skipped: <span className="font-medium">{bulkResult.summary.listings_skipped}</span></div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Listing</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkResult.affected_listings.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">No listings affected.</TableCell>
                      </TableRow>
                    )}
                    {bulkResult.affected_listings.map((row) => (
                      <TableRow key={`${row.listing_id}:${row.action}`}>
                        <TableCell>{row.listing_name}</TableCell>
                        <TableCell>{row.action}</TableCell>
                        <TableCell className="text-muted-foreground">{row.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                <div className="text-xs text-muted-foreground">
                  Listing: {listingNameById[template.listing_id] || template.listing_id}
                </div>
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

            <Button onClick={addItem} disabled={!activeTemplateId || !itemLabel.trim()}>
              Add Item
            </Button>

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

        {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
      </div>
    </div>
  );
}
