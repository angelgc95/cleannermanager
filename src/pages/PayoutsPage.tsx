import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { DollarSign, Plus } from "lucide-react";

export default function PayoutsPage() {
  const { role, orgId, user } = useAuth();
  const { toast } = useToast();
  const isHost = role === "admin" || role === "manager";

  const [payouts, setPayouts] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Create payout state (host only)
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [selectedCleaner, setSelectedCleaner] = useState("");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [unpaidItems, setUnpaidItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const fetchPayouts = async () => {
    const { data } = await supabase
      .from("payouts")
      .select("*, profiles:cleaner_user_id(name), payout_periods:period_id(start_date, end_date)")
      .order("created_at", { ascending: false });
    setPayouts(data || []);
  };

  const fetchCleaners = async () => {
    if (!orgId) return;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, email, hourly_rate_override")
      .eq("org_id", orgId);
    if (!profiles) return;
    const cleanerList: any[] = [];
    for (const p of profiles) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", p.user_id);
      if (roles?.some((r) => r.role === "cleaner")) cleanerList.push(p);
    }
    setCleaners(cleanerList);
  };

  useEffect(() => {
    fetchPayouts();
    if (isHost) fetchCleaners();
  }, [orgId]);

  const fetchUnpaidItems = async () => {
    if (!selectedCleaner) return;

    // Fetch unpaid log_hours
    const { data: logData } = await supabase
      .from("log_hours")
      .select("*, cleaning_tasks:cleaning_task_id(properties(name))")
      .eq("user_id", selectedCleaner)
      .is("payout_id", null)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date");

    // Also fetch completed checklist_runs that have NO log_hours entry
    const { data: runData } = await supabase
      .from("checklist_runs")
      .select("id, cleaning_task_id, cleaner_user_id, started_at, finished_at, duration_minutes, property_id, cleaning_tasks:cleaning_task_id(properties(name))")
      .eq("cleaner_user_id", selectedCleaner)
      .not("finished_at", "is", null)
      .not("duration_minutes", "is", null)
      .gte("finished_at", `${dateFrom}T00:00:00`)
      .lte("finished_at", `${dateTo}T23:59:59`);

    // Filter out runs that already have a log_hours entry
    const logRunIds = new Set((logData || []).map((l: any) => l.checklist_run_id).filter(Boolean));
    const orphanRuns = (runData || []).filter((r: any) => !logRunIds.has(r.id));

    // Normalize orphan runs into the same shape as log_hours items
    const orphanItems = orphanRuns.map((r: any) => ({
      id: `run_${r.id}`,
      _run_id: r.id,
      _is_run: true,
      date: r.finished_at?.split("T")[0] || "",
      start_at: r.started_at ? new Date(r.started_at).toTimeString().slice(0, 5) : "—",
      end_at: r.finished_at ? new Date(r.finished_at).toTimeString().slice(0, 5) : "—",
      duration_minutes: r.duration_minutes,
      source: "CHECKLIST",
      description: "From completed checklist (no log entry)",
      cleaning_tasks: r.cleaning_tasks,
      user_id: r.cleaner_user_id,
      property_id: r.property_id,
      cleaning_task_id: r.cleaning_task_id,
    }));

    const combined = [...(logData || []), ...orphanItems].sort((a, b) => a.date.localeCompare(b.date));
    setUnpaidItems(combined);
    setSelectedItems(new Set(combined.map((i: any) => i.id)));
  };

  useEffect(() => {
    if (selectedCleaner && dateFrom && dateTo) fetchUnpaidItems();
  }, [selectedCleaner, dateFrom, dateTo]);

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedHours = unpaidItems
    .filter((i) => selectedItems.has(i.id))
    .reduce((sum, i) => sum + (i.duration_minutes || 0), 0);

  const cleanerProfile = cleaners.find((c) => c.user_id === selectedCleaner);
  const hourlyRate = cleanerProfile?.hourly_rate_override || 15;
  const totalAmount = (selectedHours / 60) * hourlyRate;

  const handleCreatePayout = async () => {
    if (!orgId || !selectedCleaner || selectedItems.size === 0) return;
    setCreating(true);

    try {
      // Create payout period
      const { data: period, error: periodError } = await supabase
        .from("payout_periods")
        .insert({ start_date: dateFrom, end_date: dateTo, org_id: orgId, status: "CLOSED" as const })
        .select()
        .single();
      if (periodError) throw periodError;

      // Create payout
      const { data: payout, error: payoutError } = await supabase
        .from("payouts")
        .insert({
          period_id: period.id,
          cleaner_user_id: selectedCleaner,
          hourly_rate_used: hourlyRate,
          total_minutes: selectedHours,
          total_amount: totalAmount,
          org_id: orgId,
          status: "PENDING" as const,
        })
        .select()
        .single();
      if (payoutError) throw payoutError;

      // Separate real log_hours ids from orphan run items
      const realLogIds = Array.from(selectedItems).filter((id) => !id.startsWith("run_"));
      const orphanRunItems = unpaidItems.filter((i) => selectedItems.has(i.id) && i._is_run);

      // Create log_hours for orphan checklist runs
      for (const item of orphanRunItems) {
        const { data: newLog } = await supabase.from("log_hours").insert({
          user_id: item.user_id,
          date: item.date,
          start_at: item.start_at === "—" ? "09:00" : item.start_at,
          end_at: item.end_at === "—" ? "17:00" : item.end_at,
          duration_minutes: item.duration_minutes,
          source: "CHECKLIST" as const,
          checklist_run_id: item._run_id,
          cleaning_task_id: item.cleaning_task_id,
          property_id: item.property_id || null,
          org_id: orgId,
          payout_id: payout.id,
        }).select("id").single();
        // No need to add to realLogIds since payout_id is already set
      }

      // Mark existing log_hours as paid
      if (realLogIds.length > 0) {
        await supabase.from("log_hours").update({ payout_id: payout.id }).in("id", realLogIds);
      }

      toast({ title: "Payout created", description: `€${totalAmount.toFixed(2)} for ${cleanerProfile?.name}` });
      setShowCreate(false);
      setSelectedCleaner("");
      setUnpaidItems([]);
      setSelectedItems(new Set());
      fetchPayouts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payouts"
        description={isHost ? "Create and manage cleaner payouts" : "Your payout history"}
        actions={
          isHost ? (
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-4 w-4 mr-1" /> Create Payout
            </Button>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4 max-w-3xl">
        {/* Create Payout Form (Host only) */}
        {showCreate && isHost && (
          <Card>
            <CardHeader><CardTitle className="text-base">New Payout</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Cleaner</Label>
                  <Select value={selectedCleaner} onValueChange={setSelectedCleaner}>
                    <SelectTrigger><SelectValue placeholder="Select cleaner..." /></SelectTrigger>
                    <SelectContent>
                      {cleaners.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              {unpaidItems.length > 0 && (
                <>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {unpaidItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 rounded border border-border">
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleItem(item.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {format(new Date(item.date), "MMM d")} · {item.start_at?.slice(0, 5)} – {item.end_at?.slice(0, 5)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.duration_minutes} min · {item.source} {item.description ? `· ${item.description}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="text-sm">
                      <p className="text-muted-foreground">{selectedItems.size} items · {selectedHours} min · €{hourlyRate.toFixed(2)}/hr</p>
                      <p className="text-lg font-bold">€{totalAmount.toFixed(2)}</p>
                    </div>
                    <Button onClick={handleCreatePayout} disabled={creating || selectedItems.size === 0}>
                      {creating ? "Creating..." : "Create Payout"}
                    </Button>
                  </div>
                </>
              )}

              {selectedCleaner && unpaidItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No unpaid hours found in this range.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payout List */}
        {payouts.length === 0 && !showCreate && <p className="text-center text-muted-foreground py-8">No payouts yet.</p>}
        {payouts.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">{p.profiles?.name || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">
                  {p.payout_periods?.start_date && format(new Date(p.payout_periods.start_date), "MMM d")} – {p.payout_periods?.end_date && format(new Date(p.payout_periods.end_date), "MMM d, yyyy")}
                  {" · "}{p.total_minutes} min @ €{Number(p.hourly_rate_used).toFixed(2)}/hr
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-sm">€{Number(p.total_amount).toFixed(2)}</p>
                <StatusBadge status={p.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
