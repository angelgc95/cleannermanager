import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Unit = { id: string; name: string; type: string; parent_id: string | null };
type Listing = {
  id: string;
  name: string;
  unit_id: string;
  active: boolean;
  ical_url: string | null;
  checkin_time_local: string;
  timezone: string;
};
type Template = {
  id: string;
  name: string;
  listing_id: string;
  active: boolean;
  created_at: string;
};
type TemplateAssignment = {
  unit_id: string;
  template_id: string;
  updated_at: string;
  created_at: string;
};

type ListingDraft = {
  checkin_time_local: string;
  timezone: string;
};

function normalizeCheckinTime(value: string): string | null {
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

export default function ListingsPage() {
  const { organizationId } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateAssignments, setTemplateAssignments] = useState<TemplateAssignment[]>([]);
  const [listingDrafts, setListingDrafts] = useState<Record<string, ListingDraft>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [icalUrl, setIcalUrl] = useState("");
  const [checkinTimeLocal, setCheckinTimeLocal] = useState("15:00");
  const [timezone, setTimezone] = useState("UTC");

  const load = async () => {
    if (!organizationId) return;

    const [{ data: unitRows }, { data: listingRows }, { data: templateRows }, { data: assignmentRows }] = await Promise.all([
      db.from("v1_org_units").select("id, name, type, parent_id").eq("organization_id", organizationId).order("name", { ascending: true }),
      db
        .from("v1_listings")
        .select("id, name, unit_id, active, ical_url, checkin_time_local, timezone")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      db
        .from("v1_checklist_templates")
        .select("id, name, listing_id, active, created_at")
        .eq("organization_id", organizationId)
        .eq("active", true),
      db
        .from("v1_template_assignments")
        .select("unit_id, template_id, updated_at, created_at")
        .eq("organization_id", organizationId),
    ]);

    const nextListings = (listingRows || []) as Listing[];
    setUnits((unitRows || []) as Unit[]);
    setListings(nextListings);
    setTemplates((templateRows || []) as Template[]);
    setTemplateAssignments((assignmentRows || []) as TemplateAssignment[]);

    const nextDrafts: Record<string, ListingDraft> = {};
    for (const listing of nextListings) {
      nextDrafts[listing.id] = {
        checkin_time_local: listing.checkin_time_local || "15:00",
        timezone: listing.timezone || "UTC",
      };
    }
    setListingDrafts(nextDrafts);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const templateNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const template of templates) {
      map[template.id] = template.name;
    }
    return map;
  }, [templates]);

  const listingOverrideByListingId = useMemo(() => {
    const map = new Map<string, Template>();
    for (const template of templates) {
      const current = map.get(template.listing_id);
      if (!current || template.created_at > current.created_at) {
        map.set(template.listing_id, template);
      }
    }
    return map;
  }, [templates]);

  const unitParentById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const unit of units) {
      map.set(unit.id, unit.parent_id);
    }
    return map;
  }, [units]);

  const templateAssignmentByUnitId = useMemo(() => {
    const map = new Map<string, TemplateAssignment>();
    for (const assignment of templateAssignments) {
      map.set(assignment.unit_id, assignment);
    }
    return map;
  }, [templateAssignments]);

  const effectiveTemplateByListingId = useMemo(() => {
    const map = new Map<string, { name: string; source: string }>();

    for (const listing of listings) {
      const override = listingOverrideByListingId.get(listing.id);
      if (override) {
        map.set(listing.id, { name: override.name, source: "Listing override" });
        continue;
      }

      let currentUnitId: string | null = listing.unit_id;
      let guard = 0;
      while (currentUnitId && guard < 32) {
        const assignment = templateAssignmentByUnitId.get(currentUnitId);
        if (assignment) {
          map.set(listing.id, {
            name: templateNameById[assignment.template_id] || assignment.template_id,
            source: currentUnitId === listing.unit_id ? "Unit assignment" : "Inherited from ancestor",
          });
          break;
        }
        currentUnitId = unitParentById.get(currentUnitId) ?? null;
        guard += 1;
      }
    }

    return map;
  }, [listings, listingOverrideByListingId, templateAssignmentByUnitId, templateNameById, unitParentById]);

  const createListing = async () => {
    if (!organizationId || !name.trim() || !unitId) return;
    setStatusMessage(null);

    const normalizedCheckin = normalizeCheckinTime(checkinTimeLocal);
    if (!normalizedCheckin) {
      setStatusMessage("Check-in local time must use HH:MM (24h).");
      return;
    }

    await db.from("v1_listings").insert({
      organization_id: organizationId,
      unit_id: unitId,
      name: name.trim(),
      ical_url: icalUrl.trim() || null,
      checkin_time_local: normalizedCheckin,
      timezone: timezone.trim() || "UTC",
      active: true,
    });

    setName("");
    setIcalUrl("");
    setCheckinTimeLocal("15:00");
    setTimezone("UTC");
    setStatusMessage("Listing created.");
    await load();
  };

  const toggleActive = async (listing: Listing, active: boolean) => {
    await db.from("v1_listings").update({ active }).eq("id", listing.id);
    await load();
  };

  const saveListingSettings = async (listingId: string) => {
    const draft = listingDrafts[listingId];
    if (!draft) return;

    const normalizedCheckin = normalizeCheckinTime(draft.checkin_time_local);
    if (!normalizedCheckin) {
      setStatusMessage("Check-in local time must use HH:MM (24h).");
      return;
    }

    setStatusMessage(null);

    const { error } = await db
      .from("v1_listings")
      .update({
        checkin_time_local: normalizedCheckin,
        timezone: draft.timezone.trim() || "UTC",
      })
      .eq("id", listingId);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Listing settings updated.");
    await load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader><CardTitle>Create Listing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Apartment 2A" />
          </div>

          <div className="space-y-1">
            <Label>Unit</Label>
            <Select value={unitId || ""} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name} ({unit.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>iCal URL</Label>
            <Input value={icalUrl} onChange={(event) => setIcalUrl(event.target.value)} placeholder="https://.../calendar.ics" />
          </div>

          <div className="space-y-1">
            <Label>Check-in time local (HH:MM)</Label>
            <Input value={checkinTimeLocal} onChange={(event) => setCheckinTimeLocal(event.target.value)} placeholder="15:00" />
          </div>

          <div className="space-y-1">
            <Label>Timezone (IANA)</Label>
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Europe/Madrid" />
          </div>

          <Button onClick={createListing} className="w-full" disabled={!organizationId || !unitId || !name.trim()}>
            Add Listing
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Listings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {listings.length === 0 && <p className="text-sm text-muted-foreground">No listings yet.</p>}
          {listings.map((listing) => {
            const draft = listingDrafts[listing.id] || {
              checkin_time_local: listing.checkin_time_local || "15:00",
              timezone: listing.timezone || "UTC",
            };

            return (
              <div key={listing.id} className="space-y-3 rounded border border-border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{listing.name}</div>
                    <div className="text-xs text-muted-foreground">{listing.ical_url || "No iCal URL"}</div>
                    <div className="text-xs text-muted-foreground">
                      Effective template: {effectiveTemplateByListingId.get(listing.id)?.name || "No template"}
                      {effectiveTemplateByListingId.get(listing.id)?.source ? ` · ${effectiveTemplateByListingId.get(listing.id)?.source}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{listing.active ? "Active" : "Inactive"}</span>
                    <Switch checked={listing.active} onCheckedChange={(checked) => toggleActive(listing, !!checked)} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Check-in time local</Label>
                    <Input
                      value={draft.checkin_time_local}
                      onChange={(event) => setListingDrafts({
                        ...listingDrafts,
                        [listing.id]: {
                          ...draft,
                          checkin_time_local: event.target.value,
                        },
                      })}
                      placeholder="15:00"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Timezone</Label>
                    <Input
                      value={draft.timezone}
                      onChange={(event) => setListingDrafts({
                        ...listingDrafts,
                        [listing.id]: {
                          ...draft,
                          timezone: event.target.value,
                        },
                      })}
                      placeholder="UTC"
                    />
                  </div>
                </div>

                <Button variant="outline" size="sm" onClick={() => saveListingSettings(listing.id)}>
                  Save Listing Settings
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
