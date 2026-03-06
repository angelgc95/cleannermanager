import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

interface Kpis {
  units: number;
  listings: number;
  members: number;
  events: number;
}

export default function OverviewPage() {
  const { organizationId, organizationsV1 } = useAuth();
  const [kpis, setKpis] = useState<Kpis>({ units: 0, listings: 0, members: 0, events: 0 });

  useEffect(() => {
    if (!organizationId) return;

    const load = async () => {
      const [{ count: units }, { count: listings }, { count: members }, { count: events }] = await Promise.all([
        db.from("v1_org_units").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        db.from("v1_listings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        db.from("v1_organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId),
        db.from("v1_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      ]);

      setKpis({
        units: units || 0,
        listings: listings || 0,
        members: members || 0,
        events: events || 0,
      });
    };

    load();
  }, [organizationId]);

  const activeOrg = organizationsV1.find((org) => org.id === organizationId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization Overview</h1>
        <p className="text-sm text-muted-foreground">
          {activeOrg ? activeOrg.name : "Select an organization to begin."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Units</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{kpis.units}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Listings</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{kpis.listings}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Members</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{kpis.members}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Events</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{kpis.events}</CardContent></Card>
      </div>
    </div>
  );
}
