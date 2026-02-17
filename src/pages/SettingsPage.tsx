import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";

import { NotificationSettings } from "@/components/NotificationSettings";

export default function SettingsPage() {
  const { toast } = useToast();
  const [properties, setProperties] = useState<any[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newProp, setNewProp] = useState({ name: "", default_checkin_time: "15:00", default_checkout_time: "11:00", cleaning_mode: "CLEAN_ON_CHECKOUT", ics_url_airbnb: "", ics_url_booking: "" });

  const fetchProperties = async () => {
    const { data } = await supabase.from("properties").select("*").order("name");
    setProperties(data || []);
  };

  useEffect(() => { fetchProperties(); }, []);

  const addProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("properties").insert([{
      ...newProp,
      cleaning_mode: newProp.cleaning_mode as "CLEAN_ON_CHECKIN" | "CLEAN_ON_CHECKOUT",
    }]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Property added" });
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
      toast({
        title: "Sync failed",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage properties, calendar sync, and templates"
        actions={
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4 mr-1" /> Add Property
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-3xl">
        {showAdd && (
          <Card>
            <CardHeader><CardTitle className="text-base">New Property</CardTitle></CardHeader>
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
                <Button type="submit">Save Property</Button>
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
        {properties.length === 0 && !showAdd && <p className="text-center text-muted-foreground py-8">No properties configured yet.</p>}

        {/* Notification Preferences */}
        <NotificationSettings />
      </div>
    </div>
  );
}
