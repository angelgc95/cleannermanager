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
import { Plus, Loader2, RefreshCw, DollarSign } from "lucide-react";
import { NotificationSettings } from "@/components/NotificationSettings";
import { PricingSuggestionsSettings } from "@/components/PricingSuggestionsSettings";
import { AdminCleanerManagement } from "@/components/admin/AdminCleanerManagement";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function PayoutScheduleSettings({ settings, onUpdate }: { settings: any; onUpdate: () => void }) {
  const { toast } = useToast();
  const [frequency, setFrequency] = useState<string>(settings.payout_frequency ?? "WEEKLY");
  const [weekEndDay, setWeekEndDay] = useState<string>(String(settings.payout_week_end_day ?? 0));
  const [hourlyRate, setHourlyRate] = useState<string>(String(settings.default_hourly_rate ?? 15));

  const handleSave = async () => {
    const { error } = await supabase
      .from("host_settings")
      .update({ payout_frequency: frequency, payout_week_end_day: parseInt(weekEndDay), default_hourly_rate: parseFloat(hourlyRate) })
      .eq("id", settings.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payout settings updated" });
      onUpdate();
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Payout Settings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WEEKLY">Weekly</SelectItem>
              <SelectItem value="BIWEEKLY">Bi-weekly</SelectItem>
              <SelectItem value="MONTHLY">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Week ends on</Label>
            <Select value={weekEndDay} onValueChange={setWeekEndDay}>
              <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>{DAY_NAMES.map((name, i) => (<SelectItem key={i} value={String(i)}>{name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Hourly Rate (€)</Label>
            <Input type="number" step="0.50" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="max-w-[200px]" />
          </div>
        </div>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [listings, setListings] = useState<any[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newListing, setNewListing] = useState({ name: "", default_checkin_time: "15:00", default_checkout_time: "11:00", ics_url_airbnb: "", ics_url_booking: "", city: "", country_code: "", base_nightly_price: "" });
  const [settings, setSettings] = useState<any>(null);

  const fetchSettings = async () => {
    if (!user) return;
    const { data } = await supabase.from("host_settings").select("*").eq("host_user_id", user.id).single();
    setSettings(data);
  };

  const fetchListings = async () => {
    if (!user) return;
    const { data } = await supabase.from("listings").select("*").eq("host_user_id", user.id).order("name");
    setListings(data || []);
  };

  useEffect(() => {
    fetchListings();
    fetchSettings();
  }, [user]);

  const addListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("listings").insert([{
      name: newListing.name,
      default_checkin_time: newListing.default_checkin_time,
      default_checkout_time: newListing.default_checkout_time,
      ics_url_airbnb: newListing.ics_url_airbnb || null,
      ics_url_booking: newListing.ics_url_booking || null,
      city: newListing.city || null,
      country_code: newListing.country_code || null,
      base_nightly_price: newListing.base_nightly_price ? parseFloat(newListing.base_nightly_price) : null,
      host_user_id: user.id,
    }]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Listing added" });
      setShowAdd(false);
      setNewListing({ name: "", default_checkin_time: "15:00", default_checkout_time: "11:00", ics_url_airbnb: "", ics_url_booking: "", city: "", country_code: "", base_nightly_price: "" });
      fetchListings();
    }
  };

  const updateListing = async (id: string, updates: any) => {
    await supabase.from("listings").update(updates).eq("id", id);
    fetchListings();
  };

  const syncListing = async (id: string) => {
    setSyncingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-ics", { body: { listing_id: id } });
      if (error) throw error;
      toast({ title: "Sync complete", description: `${data.bookings_synced} bookings synced, ${data.tasks_created} new checklists created.` });
      fetchListings();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage listings, cleaners, and payout settings" actions={<Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="h-4 w-4 mr-1" /> Add Listing</Button>} />
      <div className="p-6 space-y-4 max-w-3xl">
        {showAdd && (
          <Card>
            <CardHeader><CardTitle className="text-base">New Listing</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addListing} className="space-y-4">
                <div className="space-y-1"><Label>Name</Label><Input value={newListing.name} onChange={(e) => setNewListing({ ...newListing, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Check-in Time</Label><Input type="time" value={newListing.default_checkin_time} onChange={(e) => setNewListing({ ...newListing, default_checkin_time: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Check-out Time</Label><Input type="time" value={newListing.default_checkout_time} onChange={(e) => setNewListing({ ...newListing, default_checkout_time: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1"><Label>City</Label><Input placeholder="e.g. Barcelona" value={newListing.city} onChange={(e) => setNewListing({ ...newListing, city: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Country Code</Label><Input placeholder="e.g. ES" maxLength={2} value={newListing.country_code} onChange={(e) => setNewListing({ ...newListing, country_code: e.target.value.toUpperCase() })} /></div>
                  <div className="space-y-1"><Label>Base Nightly Price</Label><Input type="number" step="1" placeholder="e.g. 120" value={newListing.base_nightly_price} onChange={(e) => setNewListing({ ...newListing, base_nightly_price: e.target.value })} /></div>
                </div>
                <div className="space-y-2">
                  <Label>iCalendar URLs (optional)</Label>
                  <Input placeholder="Airbnb iCal URL" value={newListing.ics_url_airbnb} onChange={(e) => setNewListing({ ...newListing, ics_url_airbnb: e.target.value })} className="text-xs" />
                  <Input placeholder="Booking.com iCal URL" value={newListing.ics_url_booking} onChange={(e) => setNewListing({ ...newListing, ics_url_booking: e.target.value })} className="text-xs" />
                </div>
                <Button type="submit">Save Listing</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {listings.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{p.name}</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div><p className="text-muted-foreground">Check-in</p><p className="font-medium">{p.default_checkin_time?.slice(0, 5)}</p></div>
                <div><p className="text-muted-foreground">Check-out</p><p className="font-medium">{p.default_checkout_time?.slice(0, 5)}</p></div>
                <div><p className="text-muted-foreground">City</p><p className="font-medium">{p.city || "—"}</p></div>
                <div><p className="text-muted-foreground">Country</p><p className="font-medium">{p.country_code || "—"}</p></div>
                <div><p className="text-muted-foreground">Base Price</p><p className="font-medium">{p.base_nightly_price ? `€${p.base_nightly_price}` : "—"}</p></div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <Label className="text-xs text-muted-foreground mb-1 block">ICS URLs</Label>
                <div className="space-y-2">
                  <Input placeholder="Airbnb ICS URL" defaultValue={p.ics_url_airbnb || ""} onBlur={(e) => updateListing(p.id, { ics_url_airbnb: e.target.value })} className="text-xs" />
                  <Input placeholder="Booking.com ICS URL" defaultValue={p.ics_url_booking || ""} onBlur={(e) => updateListing(p.id, { ics_url_booking: e.target.value })} className="text-xs" />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={p.sync_enabled} onCheckedChange={(v) => updateListing(p.id, { sync_enabled: v })} />
                    <span className="text-xs text-muted-foreground">Auto-sync enabled</span>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => syncListing(p.id)} disabled={syncingId === p.id}>
                    {syncingId === p.id ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Syncing...</> : "Sync Now"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {listings.length === 0 && !showAdd && <p className="text-center text-muted-foreground py-8">No listings configured yet.</p>}

        <AdminCleanerManagement />
        {settings && <PayoutScheduleSettings settings={settings} onUpdate={fetchSettings} />}
        {settings && <PricingSuggestionsSettings settings={settings} listings={listings} onUpdate={() => { fetchSettings(); }} />}
        <NotificationSettings />
      </div>
    </div>
  );
}
