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
type Listing = { id: string; name: string; unit_id: string; active: boolean; ical_url: string | null };

export default function ListingsPage() {
  const { organizationId } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);

  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [icalUrl, setIcalUrl] = useState("");

  const load = async () => {
    if (!organizationId) return;
    const [{ data: unitRows }, { data: listingRows }] = await Promise.all([
      db.from("v1_org_units").select("id, name, type").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_listings").select("id, name, unit_id, active, ical_url").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);

    setUnits((unitRows || []) as Unit[]);
    setListings((listingRows || []) as Listing[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const createListing = async () => {
    if (!organizationId || !name.trim() || !unitId) return;
    await db.from("v1_listings").insert({
      organization_id: organizationId,
      unit_id: unitId,
      name: name.trim(),
      ical_url: icalUrl.trim() || null,
      active: true,
    });
    setName("");
    setIcalUrl("");
    await load();
  };

  const toggleActive = async (listing: Listing, active: boolean) => {
    await db.from("v1_listings").update({ active }).eq("id", listing.id);
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

          <Button onClick={createListing} className="w-full" disabled={!organizationId || !unitId || !name.trim()}>
            Add Listing
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Listings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {listings.length === 0 && <p className="text-sm text-muted-foreground">No listings yet.</p>}
          {listings.map((listing) => (
            <div key={listing.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">{listing.name}</div>
                <div className="text-xs text-muted-foreground">{listing.ical_url || "No iCal URL"}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{listing.active ? "Active" : "Inactive"}</span>
                <Switch checked={listing.active} onCheckedChange={(checked) => toggleActive(listing, !!checked)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
