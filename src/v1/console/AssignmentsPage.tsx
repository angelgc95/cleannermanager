import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Listing = { id: string; name: string; unit_id: string };
type Unit = { id: string; name: string };
type Cleaner = { user_id: string; role: string };
type Assignment = { id: string; listing_id: string; cleaner_id: string; active: boolean; created_at: string };
type BulkMode = "ADD" | "REPLACE" | "REMOVE";
type BulkResult = {
  dry_run: boolean;
  batch_id: string | null;
  summary: {
    listings_total: number;
    listings_assigned: number;
    listings_unassigned: number;
    listings_skipped: number;
    assignment_rows_inserted: number;
    assignment_rows_reactivated: number;
    assignment_rows_deactivated: number;
  };
  affected_listings: Array<{
    listing_id: string;
    listing_name: string;
    action: "ASSIGNED" | "UNASSIGNED" | "SKIPPED";
    notes: string;
  }>;
};

export default function AssignmentsPage() {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [listingId, setListingId] = useState<string | null>(null);
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [bulkUnitId, setBulkUnitId] = useState<string | null>(null);
  const [bulkCleanerIds, setBulkCleanerIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkMode>("ADD");
  const [bulkIncludeDescendants, setBulkIncludeDescendants] = useState(true);
  const [bulkDryRun, setBulkDryRun] = useState(true);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

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

  const listingNameById = useMemo(
    () => new Map(listings.map((listing) => [listing.id, listing.name])),
    [listings],
  );

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

  const toggleBulkCleaner = (targetCleanerId: string, checked: boolean) => {
    setBulkCleanerIds((current) => {
      if (checked) {
        return current.includes(targetCleanerId) ? current : [...current, targetCleanerId];
      }
      return current.filter((cleaner) => cleaner !== targetCleanerId);
    });
  };

  const canRunBulk = !!organizationId
    && !!bulkUnitId
    && (bulkMode !== "ADD" || bulkCleanerIds.length > 0);

  const runBulkAssignment = async () => {
    if (!organizationId || !bulkUnitId) return;
    if (bulkMode === "ADD" && bulkCleanerIds.length === 0) {
      toast({
        title: "Select at least one cleaner",
        description: "ADD mode requires one or more cleaners.",
        variant: "destructive",
      });
      return;
    }

    setBulkSubmitting(true);
    try {
      const { data, error } = await db.functions.invoke("bulk-assign-cleaners-v1", {
        body: {
          organization_id: organizationId,
          unit_id: bulkUnitId,
          mode: bulkMode,
          cleaner_ids: bulkCleanerIds,
          include_descendants: bulkIncludeDescendants,
          dry_run: bulkDryRun,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data as BulkResult;
      setBulkResult(result);

      toast({
        title: bulkDryRun ? "Dry run complete" : "Bulk assignment applied",
        description: `${result.summary.listings_total} listings processed.`,
      });

      if (!bulkDryRun) {
        await load();
      }
    } catch (error: any) {
      toast({
        title: "Bulk assignment failed",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="space-y-6">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bulk Assignment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={bulkUnitId || ""} onValueChange={setBulkUnitId}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={bulkMode} onValueChange={(value) => setBulkMode(value as BulkMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADD">ADD</SelectItem>
                  <SelectItem value="REPLACE">REPLACE</SelectItem>
                  <SelectItem value="REMOVE">REMOVE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Include descendant units</Label>
                <Checkbox
                  checked={bulkIncludeDescendants}
                  onCheckedChange={(checked) => setBulkIncludeDescendants(checked === true)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Dry run</Label>
                <Checkbox
                  checked={bulkDryRun}
                  onCheckedChange={(checked) => setBulkDryRun(checked === true)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cleaners</Label>
                <Badge variant="secondary">{bulkCleanerIds.length} selected</Badge>
              </div>
              <ScrollArea className="h-44 rounded-md border border-border">
                <div className="space-y-2 p-3">
                  {cleaners.length === 0 && <p className="text-sm text-muted-foreground">No cleaners available.</p>}
                  {cleaners.map((cleaner) => (
                    <label key={cleaner.user_id} className="flex items-center gap-3 rounded-sm text-sm">
                      <Checkbox
                        checked={bulkCleanerIds.includes(cleaner.user_id)}
                        onCheckedChange={(checked) => toggleBulkCleaner(cleaner.user_id, checked === true)}
                      />
                      <span className="truncate">{cleaner.user_id}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {bulkMode === "REPLACE" && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                REPLACE will reset the active cleaner set for every listing in scope. Leaving cleaners empty clears all assignments.
              </p>
            )}

            {bulkMode === "REMOVE" && bulkCleanerIds.length === 0 && (
              <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                No cleaners selected. REMOVE will deactivate every active cleaner assignment in scope.
              </p>
            )}

            <Button className="w-full" onClick={runBulkAssignment} disabled={!canRunBulk || bulkSubmitting}>
              {bulkSubmitting ? "Running..." : bulkDryRun ? "Run Dry Run" : "Apply Bulk Assignment"}
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
                  <div>Listings in scope: <span className="font-medium">{bulkResult.summary.listings_total}</span></div>
                  <div>Assigned: <span className="font-medium">{bulkResult.summary.listings_assigned}</span></div>
                  <div>Unassigned: <span className="font-medium">{bulkResult.summary.listings_unassigned}</span></div>
                  <div>Skipped: <span className="font-medium">{bulkResult.summary.listings_skipped}</span></div>
                  <div>Rows inserted: <span className="font-medium">{bulkResult.summary.assignment_rows_inserted}</span></div>
                  <div>Rows reactivated: <span className="font-medium">{bulkResult.summary.assignment_rows_reactivated}</span></div>
                  <div>Rows deactivated: <span className="font-medium">{bulkResult.summary.assignment_rows_deactivated}</span></div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">First affected listings</p>
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
                          <TableCell className="text-muted-foreground" colSpan={3}>No listings matched this request.</TableCell>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Current Assignments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {assignments.length === 0 && <p className="text-sm text-muted-foreground">No assignments.</p>}
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">Listing: {listingNameById.get(assignment.listing_id) || assignment.listing_id}</div>
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
