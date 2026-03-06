import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type UnitRow = {
  id: string;
  organization_id: string;
  name: string;
  type: "ORG_ROOT" | "COUNTRY" | "CITY" | "BUILDING";
  parent_id: string | null;
};

const unitTypes = ["COUNTRY", "CITY", "BUILDING"] as const;

export default function HierarchyPage() {
  const { organizationId } = useAuth();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof unitTypes)[number]>("COUNTRY");
  const [parentId, setParentId] = useState<string | null>(null);

  const load = async () => {
    if (!organizationId) return;
    const { data } = await db
      .from("v1_org_units")
      .select("id, organization_id, name, type, parent_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    setUnits((data || []) as UnitRow[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const root = useMemo(() => units.find((u) => u.type === "ORG_ROOT") || null, [units]);

  const addUnit = async () => {
    if (!organizationId || !name.trim()) return;
    await db.from("v1_org_units").insert({
      organization_id: organizationId,
      name: name.trim(),
      type,
      parent_id: parentId,
    });
    setName("");
    await load();
  };

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, UnitRow[]>();
    for (const unit of units) {
      const key = unit.parent_id || null;
      const list = map.get(key) || [];
      list.push(unit);
      map.set(key, list);
    }
    return map;
  }, [units]);

  const renderTree = (parent: string | null, depth = 0) => {
    const nodes = childrenByParent.get(parent) || [];
    return nodes.map((node) => (
      <div key={node.id} className="space-y-1">
        <div className="rounded border border-border px-3 py-2" style={{ marginLeft: `${depth * 18}px` }}>
          <div className="text-sm font-medium">{node.name}</div>
          <div className="text-xs text-muted-foreground">{node.type}</div>
        </div>
        {renderTree(node.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader><CardTitle>Add Unit</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Barcelona Team" />
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as (typeof unitTypes)[number])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {unitTypes.map((unitType) => (
                  <SelectItem key={unitType} value={unitType}>{unitType}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Parent</Label>
            <Select value={parentId || "__root"} onValueChange={(value) => setParentId(value === "__root" ? root?.id || null : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root">ORG_ROOT</SelectItem>
                {units.filter((u) => u.type !== "BUILDING").map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={addUnit} disabled={!organizationId || !name.trim()} className="w-full">Create Unit</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Unit Tree</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground">No units found for this organization.</p>
          ) : (
            <div className="space-y-2">{renderTree(null)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
