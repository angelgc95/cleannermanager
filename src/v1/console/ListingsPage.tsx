import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Unit = { id: string; name: string; type: string };
type Listing = {
  id: string;
  name: string;
  unit_id: string;
  active: boolean;
  ical_url: string | null;
  checkin_time_local: string;
  timezone: string;
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
  const [listingDrafts, setListingDrafts] = useState<Record<string, ListingDraft>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [icalUrl, setIcalUrl] = useState("");
  const [checkinTimeLocal, setCheckinTimeLocal] = useState("15:00");
  const [timezone, setTimezone] = useState("UTC");

  const load = async () => {
    if (!organizationId) return;
    const [{ data: unitRows }, { data: listingRows }] = await Promise.all([
      db.from("v1_org_units").select("id, name, type").eq("organization_id", organizationId).order("name", { ascending: true }),
      db
        .from("v1_listings")
        .select("id, name, unit_id, active, ical_url, checkin_time_local, timezone")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    const nextListings = (listingRows || []) as Listing[];
    setUnits((unitRows || []) as Unit[]);
    setListings(nextListings);

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
