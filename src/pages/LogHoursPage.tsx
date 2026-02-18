import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X } from "lucide-react";

export default function LogHoursPage() {
  const { user, orgId } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), start_at: "09:00", end_at: "10:00", description: "" });

  const fetchEntries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("log_hours")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(50);
    setEntries(data || []);
  };

  useEffect(() => { fetchEntries(); }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const [sh, sm] = form.start_at.split(":").map(Number);
    const [eh, em] = form.end_at.split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);

    const { error } = await supabase.from("log_hours").insert({
      user_id: user.id,
      date: form.date,
      start_at: form.start_at,
      end_at: form.end_at,
      duration_minutes: duration > 0 ? duration : 0,
      description: form.description,
      org_id: orgId,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Hours logged" });
      setShowForm(false);
      setForm({ date: format(new Date(), "yyyy-MM-dd"), start_at: "09:00", end_at: "10:00", description: "" });
      fetchEntries();
    }
  };

  return (
    <div>
      <PageHeader
        title="Log Hours"
        description="Track extra hours outside scheduled cleanings"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Log Hours</>}
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Start</Label>
                    <Input type="time" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label>End</Label>
                    <Input type="time" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What did you do?" />
                </div>
                <Button type="submit">Save</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {entries.map((entry: any) => (
          <Card key={entry.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">{format(new Date(entry.date), "MMM d, yyyy")}</p>
                <p className="text-xs text-muted-foreground">{entry.start_at?.slice(0,5)} – {entry.end_at?.slice(0,5)} · {entry.duration_minutes} min</p>
                {entry.description && <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && !showForm && (
          <p className="text-center text-muted-foreground py-8">No logged hours yet.</p>
        )}
      </div>
    </div>
  );
}
