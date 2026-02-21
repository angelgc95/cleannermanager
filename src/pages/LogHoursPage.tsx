import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X, Clock, User, Pencil, Trash2 } from "lucide-react";

export default function LogHoursPage() {
  const { user, orgId, role } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    start_at: "09:00",
    end_at: "10:00",
    description: "",
    user_id: "", // only used by admin
  });

  const isAdmin = role === "admin" || role === "manager";

  // Fetch cleaners for admin picker
  useEffect(() => {
    if (!isAdmin || !orgId) return;
    const fetchCleaners = async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "cleaner");
      if (!roleData?.length) return;
      const cleanerIds = roleData.map((r: any) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("org_id", orgId)
        .in("user_id", cleanerIds);
      setCleaners(profiles || []);
    };
    fetchCleaners();
  }, [isAdmin, orgId]);

  const fetchEntries = async () => {
    if (!user) return;
    let query = supabase
      .from("log_hours")
      .select("*")
      .order("date", { ascending: false })
      .limit(50);

    if (!isAdmin) {
      query = query.eq("user_id", user.id);
    }

    const { data } = await query;

    // Fetch user names separately (no FK from log_hours.user_id to profiles)
    if (isAdmin && data && data.length > 0) {
      const userIds = [...new Set(data.map((e: any) => e.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", userIds);
      const nameMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.name]));
      setEntries(data.map((e: any) => ({ ...e, _user_name: nameMap[e.user_id] || "Unknown" })));
    } else {
      setEntries(data || []);
    }
  };

  useEffect(() => { fetchEntries(); }, [user, role]);

  const resetForm = () => {
    setForm({
      date: format(new Date(), "yyyy-MM-dd"),
      start_at: "09:00",
      end_at: "10:00",
      description: "",
      user_id: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const targetUserId = isAdmin ? form.user_id : user.id;
    if (!targetUserId) {
      toast({ title: "Please select a cleaner", variant: "destructive" });
      return;
    }

    const [sh, sm] = form.start_at.split(":").map(Number);
    const [eh, em] = form.end_at.split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);

    if (editingId) {
      // Update existing entry
      const { error } = await supabase.from("log_hours").update({
        date: form.date,
        start_at: form.start_at,
        end_at: form.end_at,
        duration_minutes: duration > 0 ? duration : 0,
        description: form.description,
      }).eq("id", editingId);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Entry updated" });
        resetForm();
        fetchEntries();
      }
    } else {
      const { error } = await supabase.from("log_hours").insert({
        user_id: targetUserId,
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
        resetForm();
        fetchEntries();
      }
    }
  };

  const handleEdit = (entry: any) => {
    setForm({
      date: entry.date,
      start_at: entry.start_at?.slice(0, 5) || "09:00",
      end_at: entry.end_at?.slice(0, 5) || "10:00",
      description: entry.description || "",
      user_id: entry.user_id,
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("log_hours").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entry deleted" });
      fetchEntries();
    }
  };

  // Compute summary for admin: total hours per cleaner
  const summaryByUser = isAdmin
    ? entries.reduce((acc: Record<string, { name: string; totalMinutes: number; count: number }>, entry: any) => {
        const uid = entry.user_id;
        if (!acc[uid]) {
          acc[uid] = {
            name: entry._user_name || "Unknown",
            totalMinutes: 0,
            count: 0,
          };
        }
        acc[uid].totalMinutes += entry.duration_minutes || 0;
        acc[uid].count += 1;
        return acc;
      }, {})
    : {};

  const summaryList = Object.entries(summaryByUser).map(([uid, data]) => ({
    userId: uid,
    ...(data as any),
  }));

  return (
    <div>
      <PageHeader
        title="Log Hours"
        description={isAdmin ? "View submitted hours and log hours for cleaners" : "Track extra hours outside scheduled cleanings"}
        actions={
          <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
            {showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Log Hours</>}
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-3xl">
        {/* Form */}
        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {isAdmin && !editingId && (
                  <div className="space-y-1">
                    <Label>Assign to Cleaner</Label>
                    <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select cleaner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cleaners.map((c) => (
                          <SelectItem key={c.user_id} value={c.user_id}>
                            {c.name || c.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                <Button type="submit">{editingId ? "Update" : "Save"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Admin summary cards */}
        {isAdmin && summaryList.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Summary by Cleaner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summaryList.map((s) => (
                <Card key={s.userId}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.count} entries · {Math.floor(s.totalMinutes / 60)}h {s.totalMinutes % 60}m</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Entries list */}
        <div className="space-y-3">
          {isAdmin && entries.length > 0 && (
            <h3 className="text-sm font-semibold text-muted-foreground">All Entries</h3>
          )}
          {entries.map((entry: any) => (
            <Card key={entry.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{format(new Date(entry.date), "MMM d, yyyy")}</p>
                      {isAdmin && entry._user_name && (
                        <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{entry._user_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.start_at?.slice(0, 5)} – {entry.end_at?.slice(0, 5)} · {entry.duration_minutes} min</p>
                    {entry.description && <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(entry.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {entries.length === 0 && !showForm && (
            <p className="text-center text-muted-foreground py-8">No logged hours yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
