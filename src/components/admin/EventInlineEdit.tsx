import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EventInlineEditProps {
  event: any;
  onUpdated: (updated: any) => void;
}

export function EventInlineEdit({ event, onUpdated }: EventInlineEditProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const details = event.event_details_json || {};
  const [notes, setNotes] = useState(event.notes || "");
  const [status, setStatus] = useState(event.status || "TODO");
  const [nights, setNights] = useState(details.nights?.toString() || "");
  const [guests, setGuests] = useState(details.guests?.toString() || "");

  const handleSave = async () => {
    setSaving(true);
    const newDetails = {
      ...details,
      nights: nights ? Number(nights) : null,
      guests: guests ? Number(guests) : null,
    };
    const updates: any = {
      notes: notes || null,
      status,
      event_details_json: newDetails,
    };

    const { error } = await supabase
      .from("cleaning_events")
      .update(updates)
      .eq("id", event.id);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Event updated" });
    onUpdated({ ...event, ...updates });
    setEditing(false);
  };

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
        <Pencil className="h-3.5 w-3.5" /> Edit Event
      </Button>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Edit Event</CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODO">TODO</SelectItem>
              <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
              <SelectItem value="DONE">DONE</SelectItem>
              <SelectItem value="CANCELLED">CANCELLED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nights</Label>
            <Input type="number" min={0} value={nights} onChange={(e) => setNights(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Guests</Label>
            <Input type="number" min={0} value={guests} onChange={(e) => setGuests(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] text-sm" placeholder="Event notes..." />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
