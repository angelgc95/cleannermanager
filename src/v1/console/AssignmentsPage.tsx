import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Listing = { id: string; name: string; unit_id: string };
type Unit = { id: string; name: string };
type Cleaner = { user_id: string; role: string };
type Assignment = { id: string; listing_id: string; cleaner_id: string; active: boolean; created_at: string };

export default function AssignmentsPage() {
  const { organizationId } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [listingId, setListingId] = useState<string | null>(null);
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [bulkUnitId, setBulkUnitId] = useState<string | null>(null);
  const [bulkCleanerId, setBulkCleanerId] = useState<string | null>(null);

  const load = async () => {
    if (!organizationId) return;
    const [{ data: unitRows }, { data: listingRows }, { data: cleanerRows }, { data: assignmentRows }] = await Promise.all([
      db.from("v1_org_units").select("id, name").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_listings").select("id, name, unit_id").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_organization_members").select("user_id, role").eq("organization_id", organizationId).eq("role", "CLEANER"),
      db.from("v1_listing_assignments").select("id, listing_id, cleaner_id, active, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);

    setUnits((unitRows || []) as Unit[]);
    setListings((listingRows || []) as Listing[]);
    setCleaners((cleanerRows || []) as Cleaner[]);
    setAssignments((assignmentRows || []) as Assignment[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const createAssignment = async () => {
    if (!organizationId || !listingId || !cleanerId) return;
    await db.from("v1_listing_assignments").upsert({
      organization_id: organizationId,
      listing_id: listingId,
      cleaner_id: cleanerId,
      active: true,
    });
    setListingId(null);
    setCleanerId(null);
    await load();
  };

  const deactivate = async (assignmentId: string) => {
    await db.from("v1_listing_assignments").update({ active: false }).eq("id", assignmentId);
    await load();
  };

  const bulkAssignByUnit = async () => {
    if (!organizationId || !bulkUnitId || !bulkCleanerId) return;
    const targetListings = listings.filter((listing) => listing.unit_id === bulkUnitId);
    for (const listing of targetListings) {
      await db.from("v1_listing_assignments").upsert({
        organization_id: organizationId,
        listing_id: listing.id,
        cleaner_id: bulkCleanerId,
        active: true,
      });
    }
    setBulkUnitId(null);
    setBulkCleanerId(null);
    await load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader><CardTitle>Assign Cleaner to Listing</CardTitle></CardHeader>
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
            <Label>Cleaner</Label>
            <Select value={cleanerId || ""} onValueChange={setCleanerId}>
              <SelectTrigger><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                {cleaners.map((cleaner) => <SelectItem key={cleaner.user_id} value={cleaner.user_id}>{cleaner.user_id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={createAssignment} disabled={!listingId || !cleanerId}>Create Assignment</Button>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Bulk assign by unit</p>
            <div className="space-y-2">
              <Select value={bulkUnitId || ""} onValueChange={setBulkUnitId}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bulkCleanerId || ""} onValueChange={setBulkCleanerId}>
                <SelectTrigger><SelectValue placeholder="Select cleaner" /></SelectTrigger>
                <SelectContent>
                  {cleaners.map((cleaner) => <SelectItem key={cleaner.user_id} value={cleaner.user_id}>{cleaner.user_id}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full" onClick={bulkAssignByUnit} disabled={!bulkUnitId || !bulkCleanerId}>
                Bulk Assign
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current Assignments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {assignments.length === 0 && <p className="text-sm text-muted-foreground">No assignments.</p>}
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">Listing: {assignment.listing_id}</div>
                <div className="text-xs text-muted-foreground">Cleaner: {assignment.cleaner_id}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{assignment.active ? "Active" : "Inactive"}</span>
                {assignment.active && <Button variant="outline" size="sm" onClick={() => deactivate(assignment.id)}>Deactivate</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
