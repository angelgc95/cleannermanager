import { useEffect, useMemo, useState, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X, Clock, User, Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

const LogHoursPage = forwardRef<HTMLDivElement>(function LogHoursPage(_props, _ref) {
  const { user, hostId, hostIds, role } = useAuth();
  const { organizations, organizationId, setOrganizationId } = useOrg();
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    start_at: "09:00",
    end_at: "10:00",
    description: "",
    assignedCleaner: "",
    listingId: "",
  });
  const [cleaners, setCleaners] = useState<{ user_id: string; name: string }[]>([]);
  const [listings, setListings] = useState<{ id: string; name: string; host_user_id: string }[]>([]);

  const isHost = role === "host";
  const isCleaner = role === "cleaner";
  const requiresOrganizationSelection = isCleaner && organizations.length > 1 && !organizationId;
  const resolvedOrganizationId = isHost ? (organizationId || (user?.id ?? null)) : (organizationId || null);

  const fetchEntries = async () => {
    if (!user) return;

    let query = supabase.from("log_hours").select("*, payout_id").order("date", { ascending: false }).limit(50);
    if (isHost) {
      query = query.eq("host_user_id", user.id);
    } else {
      if (hostIds.length === 0) {
        setEntries([]);
        return;
      }
      query = query.eq("user_id", user.id).in("host_user_id", hostIds);
    }
    const { data } = await query;

    if (data && data.length > 0) {
      // Fetch payout statuses for entries that have a payout_id
      const payoutIds = [...new Set(data.filter((e: any) => e.payout_id).map((e: any) => e.payout_id))];
      let payoutStatusMap: Record<string, string> = {};
      if (payoutIds.length > 0) {
        const { data: payouts } = await supabase.from("payouts").select("id, status").in("id", payoutIds);
        payoutStatusMap = Object.fromEntries((payouts || []).map((p: any) => [p.id, p.status]));
      }

      if (isHost) {
        const userIds = [...new Set(data.map((e: any) => e.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", userIds);
        const nameMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.name]));
        setEntries(data.map((e: any) => ({ ...e, _user_name: nameMap[e.user_id] || "Unknown", _payout_status: e.payout_id ? (payoutStatusMap[e.payout_id] || "PENDING") : "PENDING" })));
      } else {
        setEntries(data.map((e: any) => ({ ...e, _payout_status: e.payout_id ? (payoutStatusMap[e.payout_id] || "PENDING") : "PENDING" })));
      }
    } else {
      setEntries(data || []);
    }
  };

  useEffect(() => { fetchEntries(); }, [user, role, hostIds.join(",")]);

  useEffect(() => {
    if (!user) return;
    const loadListings = async () => {
      let query = supabase
        .from("listings")
        .select("id, name, host_user_id")
        .order("name", { ascending: true });

      if (isHost) {
        query = query.eq("host_user_id", user.id);
      } else {
        if (hostIds.length === 0) {
          setListings([]);
          return;
        }
        query = query.in("host_user_id", hostIds);
      }

      const { data } = await query;
      setListings((data as { id: string; name: string; host_user_id: string }[]) || []);
    };

    loadListings();
  }, [user, isHost, hostIds.join(",")]);

  const availableListings = useMemo(() => {
    if (!resolvedOrganizationId) return [] as { id: string; name: string; host_user_id: string }[];
    return listings.filter((listing) => listing.host_user_id === resolvedOrganizationId);
  }, [listings, resolvedOrganizationId]);

  useEffect(() => {
    if (!isHost || !hostId) return;
    const loadCleaners = async () => {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("cleaner_user_id")
        .eq("host_user_id", hostId);
      if (!assignments) return;
      const cleanerIds = [...new Set(assignments.map(a => a.cleaner_user_id))];
      if (cleanerIds.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", cleanerIds);
      setCleaners(profiles || []);
    };
    loadCleaners();
  }, [isHost, hostId]);

  const resetForm = () => {
    setForm({
      date: format(new Date(), "yyyy-MM-dd"),
      start_at: "09:00",
      end_at: "10:00",
      description: "",
      assignedCleaner: "",
      listingId: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (requiresOrganizationSelection) {
      toast({
        title: "Select Organization",
        description: "Select Organization",
        variant: "destructive",
      });
      return;
    }

    if (!resolvedOrganizationId) {
      toast({
        title: "Host context required",
        description: "Select Organization",
        variant: "destructive",
      });
      return;
    }

    const selectedListing = availableListings.find((listing) => listing.id === form.listingId) || null;
    const [sh, sm] = form.start_at.split(":").map(Number);
    const [eh, em] = form.end_at.split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);

    const targetUserId = isHost && form.assignedCleaner ? form.assignedCleaner : user.id;

    if (isHost && !form.assignedCleaner && !editingId) {
      toast({ title: "Select a cleaner", description: "Please assign this entry to a cleaner.", variant: "destructive" });
      return;
    }

    if (editingId) {
      const updates: any = { date: form.date, start_at: form.start_at, end_at: form.end_at, duration_minutes: duration > 0 ? duration : 0, description: form.description };
      if (isHost && form.assignedCleaner) updates.user_id = form.assignedCleaner;
      updates.host_user_id = resolvedOrganizationId;
      updates.listing_id = selectedListing?.id || null;
      const { error } = await supabase.from("log_hours").update(updates).eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Entry updated" }); resetForm(); fetchEntries(); }
    } else {
      const { error } = await supabase.from("log_hours").insert({
        user_id: targetUserId, date: form.date, start_at: form.start_at, end_at: form.end_at,
        duration_minutes: duration > 0 ? duration : 0, description: form.description, host_user_id: resolvedOrganizationId,
        listing_id: selectedListing?.id || null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Hours logged" }); resetForm(); fetchEntries(); }
    }
  };

  const handleEdit = (entry: any) => {
    setForm({
      date: entry.date,
      start_at: entry.start_at?.slice(0, 5) || "09:00",
      end_at: entry.end_at?.slice(0, 5) || "10:00",
      description: entry.description || "",
      assignedCleaner: entry.user_id || "",
      listingId: entry.listing_id || "",
    });
    if (isCleaner && entry.host_user_id) {
      setOrganizationId(entry.host_user_id);
    }
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("log_hours").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Entry deleted" }); fetchEntries(); }
  };

  const summaryByUser = isHost
    ? entries.reduce((acc: Record<string, { name: string; totalMinutes: number; count: number }>, entry: any) => {
        const uid = entry.user_id;
        if (!acc[uid]) acc[uid] = { name: entry._user_name || "Unknown", totalMinutes: 0, count: 0 };
        acc[uid].totalMinutes += entry.duration_minutes || 0;
        acc[uid].count += 1;
        return acc;
      }, {})
    : {};
  const summaryList = Object.entries(summaryByUser).map(([uid, data]) => ({ userId: uid, ...(data as any) }));

  return (
    <div>
      <PageHeader title="Log Hours" description={isHost ? "View submitted hours" : "Track extra hours outside scheduled cleanings"} actions={
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Log Hours</>}
        </Button>
      } />
      <div className="p-6 space-y-6 max-w-3xl">
        {showForm && (
          <Card><CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isHost && (
                <div className="space-y-1">
                  <Label>Assign to Cleaner</Label>
                  <Select value={form.assignedCleaner} onValueChange={(v) => setForm({ ...form, assignedCleaner: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cleaner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cleaners.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isCleaner && organizations.length > 1 && (
                <div className="space-y-1">
                  <Label>Organization</Label>
                  <Select
                    value={organizationId || "__none"}
                    onValueChange={(value) => {
                      setOrganizationId(value === "__none" ? null : value);
                      setForm((prev) => ({ ...prev, listingId: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Select Organization</SelectItem>
                      {organizations.map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>
                          {organization.name || organization.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label>Listing <span className="text-muted-foreground font-normal">(preferred)</span></Label>
                <Select
                  value={form.listingId || "__none"}
                  onValueChange={(value) => setForm({ ...form, listingId: value === "__none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No listing selected</SelectItem>
                    {availableListings.map((listing) => (
                      <SelectItem key={listing.id} value={listing.id}>
                        {listing.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Start</Label><Input type="time" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} required /></div>
                <div className="space-y-1"><Label>End</Label><Input type="time" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What did you do?" /></div>
              <Button type="submit" disabled={requiresOrganizationSelection}>{editingId ? "Update" : "Save"}</Button>
            </form>
          </CardContent></Card>
        )}
        {isHost && summaryList.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Summary by Cleaner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summaryList.map((s) => (
                <Card key={s.userId}><CardContent className="flex items-center gap-3 p-4">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{s.name}</p><p className="text-xs text-muted-foreground">{s.count} entries · {Math.floor(s.totalMinutes / 60)}h {s.totalMinutes % 60}m</p></div>
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <Card key={entry.id}><CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><Clock className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{format(new Date(entry.date), "MMM d, yyyy")}</p>
                    {isHost && entry._user_name && <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{entry._user_name}</span>}
                  </div>
                   <p className="text-xs text-muted-foreground">{entry.start_at?.slice(0, 5)} – {entry.end_at?.slice(0, 5)} · {entry.duration_minutes} min</p>
                  {entry.description && <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>}
                </div>
                <StatusBadge status={entry._payout_status || "PENDING"} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isHost && entry.user_id === user?.id && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(entry)}><Pencil className="h-3.5 w-3.5" /></Button>
                )}
                {isHost && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(entry)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(entry.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </CardContent></Card>
          ))}
          {entries.length === 0 && !showForm && <p className="text-center text-muted-foreground py-8">No logged hours yet.</p>}
        </div>
      </div>
    </div>
  );
});
export default LogHoursPage;
