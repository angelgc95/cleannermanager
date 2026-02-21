import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Home, Plus, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CleanerWithAssignments {
  user_id: string;
  name: string;
  email: string;
  unique_code: string | null;
  assignments: { id: string; property_id: string; property_name: string }[];
}

export function AdminCleanerManagement() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [cleaners, setCleaners] = useState<CleanerWithAssignments[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [addCode, setAddCode] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchData = async () => {
    if (!orgId) return;

    // Get properties
    const { data: props } = await supabase.from("properties").select("id, name").eq("org_id", orgId).order("name");
    setProperties(props || []);

    // Get cleaner profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, email, unique_code")
      .eq("org_id", orgId);
    if (!profiles) return;

    const cleanerList: CleanerWithAssignments[] = [];
    for (const p of profiles) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", p.user_id);
      if (!roles?.some((r) => r.role === "cleaner")) continue;

      const { data: assigns } = await supabase
        .from("cleaner_assignments")
        .select("id, property_id, properties(name)")
        .eq("cleaner_user_id", p.user_id)
        .eq("org_id", orgId);

      cleanerList.push({
        ...p,
        assignments: (assigns || []).map((a: any) => ({
          id: a.id,
          property_id: a.property_id,
          property_name: a.properties?.name || "Unknown",
        })),
      });
    }
    setCleaners(cleanerList);
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const handleAddCleaner = async () => {
    if (!addCode.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type: "add_cleaner", cleaner_unique_code: addCode.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Cleaner added!", description: `${data.cleaner_name} has been added to your organization.` });
      setAddCode("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setAdding(false);
  };

  const handleAssignListing = async (cleanerUserId: string, propertyId: string) => {
    if (!orgId) return;
    const { error } = await supabase.from("cleaner_assignments").insert({
      cleaner_user_id: cleanerUserId,
      property_id: propertyId,
      org_id: orgId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Listing assigned" });
      fetchData();
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from("cleaner_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment removed" });
      fetchData();
    }
  };

  const handleRemoveCleaner = async (cleanerUserId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type: "remove_cleaner", cleaner_user_id: cleanerUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Cleaner removed" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Cleaners
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add cleaner by code */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter cleaner's unique code (e.g. 123456A)"
            value={addCode}
            onChange={(e) => setAddCode(e.target.value.toUpperCase())}
            className="flex-1 font-mono"
            maxLength={7}
          />
          <Button onClick={handleAddCleaner} disabled={adding || addCode.trim().length < 7} size="sm">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
          </Button>
        </div>

        {/* Cleaners list */}
        {cleaners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cleaners in your organization yet.</p>
        ) : (
          <div className="space-y-3">
            {cleaners.map((cleaner) => (
              <div key={cleaner.user_id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{cleaner.name}</p>
                    <p className="text-xs text-muted-foreground">{cleaner.email}</p>
                    {cleaner.unique_code && (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{cleaner.unique_code}</code>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove cleaner?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove all listing assignments for {cleaner.name}.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRemoveCleaner(cleaner.user_id)}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Assigned listings */}
                <div className="space-y-1">
                  {cleaner.assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Home className="h-3 w-3 text-muted-foreground" />
                        <span>{a.property_name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleRemoveAssignment(a.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Assign new listing */}
                {properties.length > 0 && (
                  <Select onValueChange={(v) => handleAssignListing(cleaner.user_id, v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Assign a listing..." />
                    </SelectTrigger>
                    <SelectContent>
                      {properties
                        .filter((p) => !cleaner.assignments.some((a) => a.property_id === p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
