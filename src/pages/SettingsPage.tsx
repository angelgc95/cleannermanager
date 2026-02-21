import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Copy, RefreshCw, Users } from "lucide-react";
import { NotificationSettings } from "@/components/NotificationSettings";
import { AdminCleanerManagement } from "@/components/admin/AdminCleanerManagement";

export default function SettingsPage() {
  const { toast } = useToast();
  const { orgId } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newProp, setNewProp] = useState({ name: "", default_checkin_time: "15:00", default_checkout_time: "11:00", cleaning_mode: "CLEAN_ON_CHECKOUT", ics_url_airbnb: "", ics_url_booking: "" });
  const [org, setOrg] = useState<any>(null);
  const [cleaners, setCleaners] = useState<any[]>([]);

  const fetchOrg = async () => {
    if (!orgId) return;
    const { data } = await supabase.from("organizations").select("*").eq("id", orgId).single();
    setOrg(data);
  };

  const fetchCleaners = async () => {
    if (!orgId) return;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, email")
      .eq("org_id", orgId);
    if (!profiles) return;

    // Check which are cleaners
    const cleanerProfiles: any[] = [];
    for (const p of profiles) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", p.user_id);
      const isCleaner = roles?.some((r) => r.role === "cleaner");
      if (isCleaner) cleanerProfiles.push(p);
    }
    setCleaners(cleanerProfiles);
  };

  const fetchProperties = async () => {
    const { data } = await supabase.from("properties").select("*").order("name");
    setProperties(data || []);
  };

  useEffect(() => {
    fetchProperties();
    fetchOrg();
    fetchCleaners();
  }, [orgId]);

  const addProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    const { error } = await supabase.from("properties").insert([{
      ...newProp,
      org_id: orgId,
      cleaning_mode: newProp.cleaning_mode as "CLEAN_ON_CHECKIN" | "CLEAN_ON_CHECKOUT",
    }]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Listing added" });
      setShowAdd(false);
      setNewProp({ name: "", default_checkin_time: "15:00", default_checkout_time: "11:00", cleaning_mode: "CLEAN_ON_CHECKOUT", ics_url_airbnb: "", ics_url_booking: "" });
      fetchProperties();
    }
  };

  const updateProperty = async (id: string, updates: any) => {
    await supabase.from("properties").update(updates).eq("id", id);
    fetchProperties();
  };

  const syncProperty = async (id: string) => {
    setSyncingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-ics", {
        body: { property_id: id },
      });
      if (error) throw error;
      toast({
        title: "Sync complete",
        description: `${data.bookings_synced} bookings synced, ${data.tasks_created} new checklists created.`,
      });
      fetchProperties();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  const copyInviteCode = () => {
    if (org?.invite_code) {
      navigator.clipboard.writeText(org.invite_code);
      toast({ title: "Copied!", description: "Invite code copied to clipboard." });
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage listings, team, and calendar sync"
        actions={
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4 mr-1" /> Add Listing
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-3xl">
        {/* Organization / Invite Code */}
        {org && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team & Invite Code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Organization</Label>
                <p className="font-medium text-sm">{org.name}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Invite Code (share with cleaners)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono">{org.invite_code}</code>
                  <Button variant="outline" size="sm" onClick={copyInviteCode}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {cleaners.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Cleaners ({cleaners.length})</Label>
                  <div className="mt-1 space-y-1">
                    {cleaners.map((c) => (
                      <div key={c.user_id} className="text-sm flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground text-xs">{c.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showAdd && (
          <Card>
            <CardHeader><CardTitle className="text-base">New Listing</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addProperty} className="space-y-4">
                <div className="space-y-1"><Label>Name</Label><Input value={newProp.name} onChange={(e) => setNewProp({ ...newProp, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Check-in Time</Label><Input type="time" value={newProp.default_checkin_time} onChange={(e) => setNewProp({ ...newProp, default_checkin_time: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Check-out Time</Label><Input type="time" value={newProp.default_checkout_time} onChange={(e) => setNewProp({ ...newProp, default_checkout_time: e.target.value })} /></div>
                </div>
                <div className="space-y-1">
                  <Label>Cleaning Mode</Label>
                  <Select value={newProp.cleaning_mode} onValueChange={(v) => setNewProp({ ...newProp, cleaning_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLEAN_ON_CHECKIN">Clean on Check-in</SelectItem>
                      <SelectItem value="CLEAN_ON_CHECKOUT">Clean on Check-out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>iCalendar URLs (optional)</Label>
                  <Input placeholder="Airbnb iCal URL" value={newProp.ics_url_airbnb} onChange={(e) => setNewProp({ ...newProp, ics_url_airbnb: e.target.value })} className="text-xs" />
                  <Input placeholder="Booking.com iCal URL" value={newProp.ics_url_booking} onChange={(e) => setNewProp({ ...newProp, ics_url_booking: e.target.value })} className="text-xs" />
                </div>
                <Button type="submit">Save Listing</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {properties.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{p.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{p.cleaning_mode === "CLEAN_ON_CHECKIN" ? "Clean on check-in" : "Clean on check-out"}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Check-in</p>
                  <p className="font-medium">{p.default_checkin_time?.slice(0, 5)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Check-out</p>
                  <p className="font-medium">{p.default_checkout_time?.slice(0, 5)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <Label className="text-xs text-muted-foreground mb-1 block">ICS URLs</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="Airbnb ICS URL"
                    defaultValue={p.ics_url_airbnb || ""}
                    onBlur={(e) => updateProperty(p.id, { ics_url_airbnb: e.target.value })}
                    className="text-xs"
                  />
                  <Input
                    placeholder="Booking.com ICS URL"
                    defaultValue={p.ics_url_booking || ""}
                    onBlur={(e) => updateProperty(p.id, { ics_url_booking: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.sync_enabled}
                      onCheckedChange={(v) => updateProperty(p.id, { sync_enabled: v })}
                    />
                    <span className="text-xs text-muted-foreground">Auto-sync enabled</span>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => syncProperty(p.id)} disabled={syncingId === p.id}>
                    {syncingId === p.id ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Syncing...</> : "Sync Now"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {properties.length === 0 && !showAdd && <p className="text-center text-muted-foreground py-8">No listings configured yet.</p>}

        <AdminCleanerManagement />

        <NotificationSettings />
      </div>
    </div>
  );
}
