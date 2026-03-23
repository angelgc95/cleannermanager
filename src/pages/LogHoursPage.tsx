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
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X, Clock, User, Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

const LogHoursPage = forwardRef<HTMLDivElement>(function LogHoursPage(_props, _ref) {
  const { user, hostId, role } = useAuth();
  const { toast } = useToast();
  const { formatDate, t } = useI18n();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), start_at: "09:00", end_at: "10:00", description: "", assignedCleaner: "" });
  const [cleaners, setCleaners] = useState<{ user_id: string; name: string }[]>([]);

  const isHost = role === "host";

  const fetchEntries = async () => {
    if (!user) return;
    let query = supabase.from("log_hours").select("*, payout_id").order("date", { ascending: false }).limit(200);
    if (!isHost) query = query.eq("user_id", user.id);
    const { data } = await query;

    if (data && data.length > 0) {
      // Fetch payout statuses for entries that have a payout_id
      const payoutIds = [...new Set(data.filter((e: any) => e.payout_id).map((e: any) => e.payout_id))];
      let payoutStatusMap: Record<string, string> = {};
      let payoutPeriodMap: Record<string, string | null> = {};
      let payoutPartialMap: Record<string, number> = {};
      let payoutTotalMap: Record<string, number> = {};
      let periodMap: Record<string, { start_date: string; end_date: string; status: string | null }> = {};
      if (payoutIds.length > 0) {
        const { data: payouts } = await supabase.from("payouts").select("id, status, period_id, partial_paid_amount, total_amount").in("id", payoutIds);
        payoutStatusMap = Object.fromEntries((payouts || []).map((p: any) => [p.id, p.status]));
        payoutPartialMap = Object.fromEntries((payouts || []).map((p: any) => [p.id, Number(p.partial_paid_amount || 0)]));
        payoutTotalMap = Object.fromEntries((payouts || []).map((p: any) => [p.id, Number(p.total_amount || 0)]));
        payoutPeriodMap = Object.fromEntries((payouts || []).map((p: any) => [p.id, p.period_id || null]));

        const periodIds = [...new Set((payouts || []).map((p: any) => p.period_id).filter(Boolean))];
        if (periodIds.length > 0) {
          const { data: periods } = await supabase
            .from("payout_periods")
            .select("id, start_date, end_date, status")
            .in("id", periodIds);
          periodMap = Object.fromEntries(
            (periods || []).map((period: any) => [
              period.id,
              {
                start_date: period.start_date,
                end_date: period.end_date,
                status: period.status,
              },
            ])
          );
        }
      }

      if (isHost) {
        const userIds = [...new Set(data.map((e: any) => e.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", userIds);
        const nameMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.name]));
        setEntries(
          data.map((e: any) => ({
            ...e,
            _user_name: nameMap[e.user_id] || "Unknown",
            _payout_status: e.payout_id ? (payoutStatusMap[e.payout_id] || "PENDING") : null,
            _processing_status: e.payout_id ? "PROCESSED" : "PENDING",
            _payout_period_id: e.payout_id ? payoutPeriodMap[e.payout_id] || null : null,
            _payout_period_start: e.payout_id && payoutPeriodMap[e.payout_id] ? periodMap[payoutPeriodMap[e.payout_id]]?.start_date || null : null,
            _payout_period_end: e.payout_id && payoutPeriodMap[e.payout_id] ? periodMap[payoutPeriodMap[e.payout_id]]?.end_date || null : null,
            _payout_period_status: e.payout_id && payoutPeriodMap[e.payout_id] ? periodMap[payoutPeriodMap[e.payout_id]]?.status || null : null,
            _payout_partial_paid_amount: e.payout_id ? payoutPartialMap[e.payout_id] || 0 : 0,
            _payout_total_amount: e.payout_id ? payoutTotalMap[e.payout_id] || 0 : 0,
            _payout_remaining_amount: e.payout_id ? Math.max((payoutTotalMap[e.payout_id] || 0) - (payoutPartialMap[e.payout_id] || 0), 0) : 0,
          }))
        );
      } else {
        setEntries(
          data.map((e: any) => ({
            ...e,
            _payout_status: e.payout_id ? (payoutStatusMap[e.payout_id] || "PENDING") : null,
            _processing_status: e.payout_id ? "PROCESSED" : "PENDING",
            _payout_period_id: e.payout_id ? payoutPeriodMap[e.payout_id] || null : null,
            _payout_period_start: e.payout_id && payoutPeriodMap[e.payout_id] ? periodMap[payoutPeriodMap[e.payout_id]]?.start_date || null : null,
            _payout_period_end: e.payout_id && payoutPeriodMap[e.payout_id] ? periodMap[payoutPeriodMap[e.payout_id]]?.end_date || null : null,
            _payout_period_status: e.payout_id && payoutPeriodMap[e.payout_id] ? periodMap[payoutPeriodMap[e.payout_id]]?.status || null : null,
            _payout_partial_paid_amount: e.payout_id ? payoutPartialMap[e.payout_id] || 0 : 0,
            _payout_total_amount: e.payout_id ? payoutTotalMap[e.payout_id] || 0 : 0,
            _payout_remaining_amount: e.payout_id ? Math.max((payoutTotalMap[e.payout_id] || 0) - (payoutPartialMap[e.payout_id] || 0), 0) : 0,
          }))
        );
      }
    } else {
      setEntries(data || []);
    }
  };

  useEffect(() => { fetchEntries(); }, [user, role]);

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
    setForm({ date: format(new Date(), "yyyy-MM-dd"), start_at: "09:00", end_at: "10:00", description: "", assignedCleaner: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !hostId) return;
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
      const { error } = await supabase.from("log_hours").update(updates).eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Entry updated" }); resetForm(); fetchEntries(); }
    } else {
      const { error } = await supabase.from("log_hours").insert({
        user_id: targetUserId, date: form.date, start_at: form.start_at, end_at: form.end_at,
        duration_minutes: duration > 0 ? duration : 0, description: form.description, host_user_id: hostId,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Hours logged" }); resetForm(); fetchEntries(); }
    }
  };

  const handleEdit = (entry: any) => {
    setForm({ date: entry.date, start_at: entry.start_at?.slice(0, 5) || "09:00", end_at: entry.end_at?.slice(0, 5) || "10:00", description: entry.description || "", assignedCleaner: entry.user_id || "" });
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
  const pendingEntries = entries.filter((entry: any) => entry._processing_status !== "PROCESSED");
  const processedEntries = entries.filter((entry: any) => entry._processing_status === "PROCESSED");

  const processedGroups = useMemo(() => {
    const groups = processedEntries.reduce((acc: Record<string, any>, entry: any) => {
      const key = entry._payout_period_id || entry.payout_id || `processed-${entry.id}`;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          start: entry._payout_period_start,
          end: entry._payout_period_end,
          entries: [],
          totalMinutes: 0,
          cleanerIds: new Set<string>(),
          allPaid: true,
          hasPartialPaid: false,
        };
      }

      acc[key].entries.push(entry);
      acc[key].totalMinutes += entry.duration_minutes || 0;
      acc[key].cleanerIds.add(entry.user_id);
      if (entry._payout_status !== "PAID") {
        acc[key].allPaid = false;
      }
      if (entry._payout_status === "PARTIALLY_PAID") {
        acc[key].hasPartialPaid = true;
      }
      return acc;
    }, {});

    return Object.values(groups).sort((a: any, b: any) => {
      const aDate = a.end || a.start || a.entries[0]?.date || "";
      const bDate = b.end || b.start || b.entries[0]?.date || "";
      return bDate.localeCompare(aDate);
    });
  }, [processedEntries]);

  const renderEntry = (entry: any, processed = false) => (
    <Card key={entry.id}>
      <CardContent className={cn("flex items-center justify-between p-4", processed && "bg-muted/20")}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{formatDate(entry.date, "MMM d, yyyy")}</p>
              {isHost && entry._user_name && (
                <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                  {entry._user_name}
                </span>
              )}
              <StatusBadge status={entry._processing_status || "PENDING"} />
              {processed && entry._payout_status && (
                <span className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{t("Payout status")}:</span>
                  <StatusBadge status={entry._payout_status} className="align-middle" />
                  {entry._payout_status === "PARTIALLY_PAID" && (
                    <span>
                      · {t("Paid amount")}: €{Number(entry._payout_partial_paid_amount || 0).toFixed(2)} · {t("Remaining pending")}: €{Number(entry._payout_remaining_amount || 0).toFixed(2)}
                    </span>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {entry.start_at?.slice(0, 5)} – {entry.end_at?.slice(0, 5)} · {entry.duration_minutes} min
            </p>
            {entry.description && <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isHost && entry.user_id === user?.id && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(entry)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isHost && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(entry)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(entry.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader title={t("Log Hours")} description={isHost ? t("View submitted hours") : t("Track extra hours outside scheduled cleanings")} actions={
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 mr-1" /> {t("Cancel")}</> : <><Plus className="h-4 w-4 mr-1" /> {t("Log Hours")}</>}
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
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Start</Label><Input type="time" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} required /></div>
                <div className="space-y-1"><Label>End</Label><Input type="time" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What did you do?" /></div>
              <Button type="submit">{editingId ? "Update" : "Save"}</Button>
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
        <div className="space-y-6">
          {entries.length === 0 && !showForm ? (
            <p className="text-center text-muted-foreground py-8">{t("No logged hours yet.")}</p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t("Pending Hours")}</h3>
                  {pendingEntries.length > 0 && <StatusBadge status="PENDING" />}
                </div>
                {pendingEntries.length > 0 ? (
                  pendingEntries.map((entry: any) => renderEntry(entry))
                ) : (
                  <p className="text-center text-muted-foreground py-4">{t("No pending hours.")}</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t("Processed Hours")}</h3>
                  {processedEntries.length > 0 && <StatusBadge status="PROCESSED" />}
                </div>
                {processedEntries.length > 0 ? (
                  processedGroups.map((group: any) => (
                    <Card key={group.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {group.start && group.end
                                ? `${formatDate(group.start, "MMM d")} – ${formatDate(group.end, "MMM d, yyyy")}`
                                : t("Processed Hours")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                              {" · "}
                              {Math.floor(group.totalMinutes / 60)}h {group.totalMinutes % 60}m
                              {isHost ? ` · ${group.cleanerIds.size} ${group.cleanerIds.size === 1 ? "cleaner" : "cleaners"}` : ""}
                            </p>
                          </div>
                          <StatusBadge status={group.allPaid ? "PAID" : group.hasPartialPaid ? "PARTIALLY_PAID" : "PENDING"} />
                        </div>
                        <div className="space-y-3">
                          {group.entries.map((entry: any) => renderEntry(entry, true))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-4">{t("No processed hours yet.")}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
export default LogHoursPage;
