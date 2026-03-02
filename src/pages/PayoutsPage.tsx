import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronRight, DollarSign, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PeriodGroup { period: any; payouts: any[]; }

export default function PayoutsPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const isHost = role === "host";
  const [periodGroups, setPeriodGroups] = useState<PeriodGroup[]>([]);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: periods } = await supabase.from("payout_periods").select("*").order("start_date", { ascending: false });
      if (!periods || periods.length === 0) { setPeriodGroups([]); setLoading(false); return; }
      const periodIds = periods.map((p) => p.id);
      const { data: payouts } = await supabase.from("payouts").select("*").in("period_id", periodIds).order("created_at", { ascending: false });
      const cleanerIds = [...new Set((payouts || []).map((p: any) => p.cleaner_user_id))];
      let nameMap: Record<string, string> = {};
      if (cleanerIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", cleanerIds);
        nameMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.name]));
      }
      const groups: PeriodGroup[] = periods.map((period) => ({
        period,
        payouts: (payouts || []).filter((p: any) => p.period_id === period.id).map((p: any) => ({ ...p, cleaner_name: nameMap[p.cleaner_user_id] || "Unknown" })),
      }));
      if (!isHost && user) {
        const filtered = groups.map((g) => ({ ...g, payouts: g.payouts.filter((p) => p.cleaner_user_id === user.id) })).filter((g) => g.payouts.length > 0);
        setPeriodGroups(filtered);
      } else {
        setPeriodGroups(groups);
      }
      if (periods.length > 0) setExpandedPeriods(new Set([periods[0].id]));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [user]);

  const togglePeriod = (id: string) => { setExpandedPeriods((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };

  const handleGeneratePayouts = async () => {
    if (!startDate || !endDate) {
      toast({ title: "Select dates", description: "Please select both a start and end date.", variant: "destructive" });
      return;
    }
    if (startDate >= endDate) {
      toast({ title: "Invalid range", description: "Start date must be before end date.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-payouts", {
        body: {
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
        },
      });
      if (error) throw error;
      toast({ title: "Payouts generated", description: data?.message || "Payouts have been processed." });
      fetchData();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setGenerating(false); }
  };

  const handleUpdatePayoutStatus = async (payoutId: string, newStatus: "PENDING" | "PAID") => {
    const updates: any = { status: newStatus };
    if (newStatus === "PAID") updates.paid_at = new Date().toISOString();
    const { error } = await supabase.from("payouts").update(updates).eq("id", payoutId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Payout marked as ${newStatus}` }); fetchData(); }
  };

  const handleUpdatePeriodStatus = async (periodId: string, newStatus: "OPEN" | "CLOSED") => {
    const { error } = await supabase.from("payout_periods").update({ status: newStatus as any }).eq("id", periodId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Period ${newStatus === "CLOSED" ? "closed" : "reopened"}` }); fetchData(); }
  };

  const periodTotal = (payouts: any[]) => payouts.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  const periodMinutes = (payouts: any[]) => payouts.reduce((sum, p) => sum + (p.total_minutes || 0), 0);
  const allPaid = (payouts: any[]) => payouts.length > 0 && payouts.every((p) => p.status === "PAID");

  return (
    <div>
      <PageHeader title="Payouts" description={isHost ? "Generate and manage payout periods" : "Your payout history"} />
      <div className="p-6 space-y-4 max-w-3xl">
        {isHost && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Generate Payouts for Period</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">End Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button size="sm" onClick={handleGeneratePayouts} disabled={generating || !startDate || !endDate}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${generating ? "animate-spin" : ""}`} />
                  {generating ? "Generating..." : "Generate Payouts"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && <p className="text-center text-muted-foreground py-8">Loading...</p>}
        {!loading && periodGroups.length === 0 && (
          <div className="text-center py-12 space-y-3"><DollarSign className="h-10 w-10 mx-auto text-muted-foreground/50" /><p className="text-muted-foreground">No payout periods yet.</p>
            {isHost && <p className="text-sm text-muted-foreground">Select a date range above and click "Generate Payouts".</p>}
          </div>
        )}
        {periodGroups.map(({ period, payouts }) => {
          const isExpanded = expandedPeriods.has(period.id);
          const total = periodTotal(payouts);
          const mins = periodMinutes(payouts);
          const isPaid = allPaid(payouts);
          return (
            <Card key={period.id}>
              <button onClick={() => togglePeriod(period.id)} className="w-full text-left">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div><p className="font-semibold text-sm">{format(new Date(period.start_date), "MMM d")} – {format(new Date(period.end_date), "MMM d, yyyy")}</p><p className="text-xs text-muted-foreground">{payouts.length} cleaner{payouts.length !== 1 ? "s" : ""} · {Math.floor(mins / 60)}h {mins % 60}m</p></div>
                  </div>
                  <div className="flex items-center gap-3"><div className="text-right"><p className="font-bold text-sm">€{total.toFixed(2)}</p><StatusBadge status={isPaid && payouts.length > 0 ? "PAID" : period.status} /></div></div>
                </CardContent>
              </button>
              {isExpanded && (
                <div className="border-t border-border">
                  {payouts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No payouts in this period.</p>}
                  {payouts.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-6 py-3 border-b border-border last:border-b-0">
                      <div><p className="text-sm font-medium">{p.cleaner_name}</p><p className="text-xs text-muted-foreground">{p.total_minutes} min @ €{Number(p.hourly_rate_used).toFixed(2)}/hr</p></div>
                      <div className="flex items-center gap-3">
                        <div className="text-right"><p className="font-semibold text-sm">€{Number(p.total_amount).toFixed(2)}</p><StatusBadge status={p.status} /></div>
                        {isHost && (
                          <Select value={p.status} onValueChange={(v) => handleUpdatePayoutStatus(p.id, v as "PENDING" | "PAID")}>
                            <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="PAID">Paid</SelectItem></SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  ))}
                  {isHost && (
                    <div className="flex items-center justify-end gap-2 px-6 py-3 bg-muted/30">
                      {period.status === "OPEN" ? <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleUpdatePeriodStatus(period.id, "CLOSED"); }}>Close Period</Button> : <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleUpdatePeriodStatus(period.id, "OPEN"); }}>Reopen Period</Button>}
                      {payouts.length > 0 && !isPaid && <Button size="sm" onClick={async (e) => { e.stopPropagation(); for (const p of payouts) { if (p.status !== "PAID") await handleUpdatePayoutStatus(p.id, "PAID"); } }}>Mark All Paid</Button>}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
