import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CalendarPlus, Trash2, Music, Trophy, PartyPopper, Landmark } from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = [
  { value: "music", label: "Music / Concert", icon: Music },
  { value: "sports", label: "Sports", icon: Trophy },
  { value: "festival", label: "Festival", icon: PartyPopper },
  { value: "bank_holiday", label: "Bank Holiday", icon: Landmark },
];

export function ManualEventEntry({ listings }: { listings: any[] }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", category: "music", venue: "", popularity_score: "0.7", listing_id: "" });

  const fetchEvents = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("events_cache")
      .select("*")
      .eq("host_user_id", user.id)
      .eq("source", "manual")
      .order("date", { ascending: true });
    setEvents(data || []);
  };

  useEffect(() => { fetchEvents(); }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.title || !form.date || !form.listing_id) return;

    const listing = listings.find((l) => l.id === form.listing_id);
    const locationKey = `${(listing?.city || "unknown").toLowerCase()}_${(listing?.country_code || "XX").toLowerCase()}`;

    const { error } = await supabase.from("events_cache").insert({
      host_user_id: user.id,
      location_key: locationKey,
      date: form.date,
      category: form.category,
      title: form.title,
      venue: form.venue || null,
      popularity_score: parseFloat(form.popularity_score),
      source: "manual",
      raw: null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event added" });
      setForm({ title: "", date: "", category: "music", venue: "", popularity_score: "0.7", listing_id: form.listing_id });
      fetchEvents();
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("events_cache").delete().eq("id", id);
    fetchEvents();
  };

  const catIcon = (cat: string) => {
    const c = CATEGORIES.find((c) => c.value === cat);
    return c ? <c.icon className="h-3.5 w-3.5" /> : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><CalendarPlus className="h-4 w-4" /> Local Events</span>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add Event"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleAdd} className="space-y-3 border border-border rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Event Title</Label>
                <Input placeholder="e.g. Primavera Sound" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Venue (optional)</Label>
                <Input placeholder="e.g. Camp Nou" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Impact (0-1)</Label>
                <Input type="number" step="0.1" min="0" max="1" value={form.popularity_score} onChange={(e) => setForm({ ...form, popularity_score: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Listing (for location matching)</Label>
              <Select value={form.listing_id} onValueChange={(v) => setForm({ ...form, listing_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select listing" /></SelectTrigger>
                <SelectContent>
                  {listings.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm">Add Event</Button>
          </form>
        )}

        {events.length > 0 ? (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  {catIcon(ev.category)}
                  <span className="text-sm font-medium">{ev.title}</span>
                  <span className="text-xs text-muted-foreground">{ev.date}</span>
                  {ev.venue && <span className="text-xs text-muted-foreground">· {ev.venue}</span>}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(ev.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          !showForm && <p className="text-sm text-muted-foreground">No manual events added. Add local concerts, sports matches, or festivals to improve price suggestions.</p>
        )}
      </CardContent>
    </Card>
  );
}
