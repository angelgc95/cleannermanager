import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";
import type { V1Role, V1ScopeType } from "@/v1/types";

const roles: V1Role[] = ["OWNER", "ORG_ADMIN", "MANAGER", "QA", "CLEANER"];
const scopes: V1ScopeType[] = ["ORG", "UNIT", "LISTING"];

type Member = { user_id: string; role: V1Role; created_at: string };
type RoleAssignment = { id: string; user_id: string; role: V1Role; scope_type: V1ScopeType; scope_id: string | null };
type Unit = { id: string; name: string };
type Listing = { id: string; name: string };

export default function PeopleRolesPage() {
  const { organizationId } = useAuth();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<V1Role>("MANAGER");
  const [scopeType, setScopeType] = useState<V1ScopeType>("ORG");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);

  const load = async () => {
    if (!organizationId) return;

    const [{ data: memberRows }, { data: assignmentRows }, { data: unitRows }, { data: listingRows }] = await Promise.all([
      db.from("v1_organization_members").select("user_id, role, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      db.from("v1_role_assignments").select("id, user_id, role, scope_type, scope_id").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      db.from("v1_org_units").select("id, name").eq("organization_id", organizationId).order("name", { ascending: true }),
      db.from("v1_listings").select("id, name").eq("organization_id", organizationId).order("name", { ascending: true }),
    ]);

    setMembers((memberRows || []) as Member[]);
    setAssignments((assignmentRows || []) as RoleAssignment[]);
    setUnits((unitRows || []) as Unit[]);
    setListings((listingRows || []) as Listing[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const addMember = async () => {
    if (!organizationId || !email.trim()) return;
    setStatusMessage(null);

    const { data: profile } = await db
      .from("profiles")
      .select("user_id, email")
      .eq("email", email.trim())
      .maybeSingle();

    if (!profile?.user_id) {
      setStatusMessage("No profile found for that email.");
      return;
    }

    await db.from("v1_organization_members").upsert({
      organization_id: organizationId,
      user_id: profile.user_id,
      role,
    });

    await db.from("v1_role_assignments").insert({
      organization_id: organizationId,
      user_id: profile.user_id,
      role,
      scope_type: scopeType,
      scope_id: scopeType === "ORG" ? null : scopeId,
    });

    setStatusMessage("Member added and role assignment created.");
    setEmail("");
    await load();
  };

  const scopeOptions = scopeType === "UNIT" ? units : listings;

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader><CardTitle>Add Member by Email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="cleaner@company.com" />
          </div>

          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as V1Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((entry) => (
                  <SelectItem key={entry} value={entry}>{entry}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Scope Type</Label>
            <Select
              value={scopeType}
              onValueChange={(value) => {
                setScopeType(value as V1ScopeType);
                setScopeId(null);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {scopes.map((entry) => (
                  <SelectItem key={entry} value={entry}>{entry}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {scopeType !== "ORG" && (
            <div className="space-y-1">
              <Label>Scope Target</Label>
              <Select value={scopeId || ""} onValueChange={setScopeId}>
                <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={addMember} className="w-full" disabled={!organizationId || !email.trim() || (scopeType !== "ORG" && !scopeId)}>
            Add Member
          </Button>

          {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Members</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {members.length === 0 ? <p className="text-sm text-muted-foreground">No members.</p> : members.map((member) => (
              <div key={member.user_id} className="rounded border border-border px-3 py-2 text-sm">
                <div className="font-medium">{member.user_id}</div>
                <div className="text-xs text-muted-foreground">Primary role: {member.role}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Role Assignments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {assignments.length === 0 ? <p className="text-sm text-muted-foreground">No scoped assignments.</p> : assignments.map((assignment) => (
              <div key={assignment.id} className="rounded border border-border px-3 py-2 text-sm">
                <div className="font-medium">{assignment.user_id}</div>
                <div className="text-xs text-muted-foreground">
                  {assignment.role} · {assignment.scope_type}{assignment.scope_id ? ` (${assignment.scope_id})` : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
