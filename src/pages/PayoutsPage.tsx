import { useCallback, useEffect, useState, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronRight, DollarSign, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Database } from "@/integrations/supabase/types";

type Payout = Database["public"]["Tables"]["payouts"]["Row"];
type PayoutUpdate = Database["public"]["Tables"]["payouts"]["Update"];
type PayoutPeriod = Database["public"]["Tables"]["payout_periods"]["Row"];
type PayoutWithCleaner = Payout & { cleaner_name: string };
interface PeriodGroup { period: PayoutPeriod; payouts: PayoutWithCleaner[]; }
type PayoutStatus = "PENDING" | "PARTIALLY_PAID" | "PAID";

const getManualAdjustmentAmount = (payout: Payout) => Number(payout.manual_adjustment_amount || 0);
const getCalculatedAmount = (payout: Payout) => {
  const adjustment = getManualAdjustmentAmount(payout);
  return Number(payout.calculated_amount ?? Number(payout.total_amount || 0) - adjustment);
};
const getFinalAmount = (payout: Payout) => Number(payout.total_amount ?? getCalculatedAmount(payout) + getManualAdjustmentAmount(payout));
const formatSignedCurrency = (value: number) => `${value >= 0 ? "+" : "-"}€${Math.abs(value).toFixed(2)}`;
const periodTotal = (payouts: Payout[]) => payouts.reduce((sum, p) => sum + getFinalAmount(p), 0);
const periodAdjustmentTotal = (payouts: Payout[]) => payouts.reduce((sum, p) => sum + getManualAdjustmentAmount(p), 0);
const periodMinutes = (payouts: Payout[]) => payouts.reduce((sum, p) => sum + (p.total_minutes || 0), 0);
const periodEvents = (payouts: Payout[]) => payouts.reduce((sum, p) => sum + Number(p.event_count || 0), 0);
const allPaid = (payouts: Payout[]) => payouts.length > 0 && payouts.every((p) => p.status === "PAID");
const hasPartial = (payouts: Payout[]) => payouts.some((p) => p.status === "PARTIALLY_PAID");
const getPaidAmount = (payout: Payout) => {
  const total = getFinalAmount(payout);
  if (payout.status === "PAID") return total;
  return Math.min(Number(payout.partial_paid_amount || 0), total);
};
const getRemainingAmount = (payout: Payout) => Math.max(getFinalAmount(payout) - getPaidAmount(payout), 0);
const getPeriodPaymentStatus = (payouts: Payout[]) => {
  if (allPaid(payouts)) return "PAID";
  if (hasPartial(payouts)) return "PARTIALLY_PAID";
  return null;
};

const PayoutsPage = forwardRef<HTMLDivElement>(function PayoutsPage(_props, _ref) {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { formatDate, t } = useI18n();
  const isHost = role === "host";
  const [periodGroups, setPeriodGroups] = useState<PeriodGroup[]>([]);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [partialDialogOpen, setPartialDialogOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<PayoutWithCleaner | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [savingPartial, setSavingPartial] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: periods } = await supabase.from("payout_periods").select("*").order("start_date", { ascending: false });
      if (!periods || periods.length === 0) { setPeriodGroups([]); setLoading(false); return; }
      const periodIds = periods.map((p) => p.id);
      const { data: payouts } = await supabase.from("payouts").select("*").in("period_id", periodIds).order("created_at", { ascending: false });
      const payoutRows = payouts || [];
      const cleanerIds = [...new Set(payoutRows.map((p) => p.cleaner_user_id))];
      let nameMap: Record<string, string> = {};
      if (cleanerIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", cleanerIds);
        nameMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.name || "Unknown"]));
      }
      const groups: PeriodGroup[] = periods.map((period) => ({
        period,
        payouts: payoutRows.filter((p) => p.period_id === period.id).map((p) => ({ ...p, cleaner_name: nameMap[p.cleaner_user_id] || "Unknown" })),
      }));
      if (!isHost && user?.id) {
        const filtered = groups.map((g) => ({ ...g, payouts: g.payouts.filter((p) => p.cleaner_user_id === user.id) })).filter((g) => g.payouts.length > 0);
        setPeriodGroups(filtered);
      } else {
        setPeriodGroups(groups);
      }
      if (periods.length > 0) setExpandedPeriods(new Set([periods[0].id]));
    } finally { setLoading(false); }
  }, [isHost, user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    } catch (err) {
      const description = err instanceof Error ? err.message : "Unable to generate payouts.";
      toast({ title: "Error", description, variant: "destructive" });
    }
    finally { setGenerating(false); }
  };

  const handleUpdatePayoutStatus = async (
    payoutId: string,
    newStatus: PayoutStatus,
    options?: { partialPaidAmount?: number | null; totalAmount?: number }
  ) => {
    const updates: PayoutUpdate = { status: newStatus };
    if (newStatus === "PAID") {
      updates.paid_at = new Date().toISOString();
      updates.partial_paid_amount = Number(options?.totalAmount || 0) || null;
    } else if (newStatus === "PARTIALLY_PAID") {
      updates.paid_at = null;
      updates.partial_paid_amount = options?.partialPaidAmount ?? null;
    } else {
      updates.paid_at = null;
      updates.partial_paid_amount = null;
    }
    const { error } = await supabase.from("payouts").update(updates).eq("id", payoutId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: t("Payout updated") });
    fetchData();
    return true;
  };

  const handleUpdatePeriodStatus = async (periodId: string, newStatus: "OPEN" | "CLOSED") => {
    const { error } = await supabase.from("payout_periods").update({ status: newStatus }).eq("id", periodId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Period ${newStatus === "CLOSED" ? "closed" : "reopened"}` }); fetchData(); }
  };

  const handleDeletePayout = async (payoutId: string) => {
    // Unlink payout-linked work before deleting the payout row.
    await supabase.from("log_hours").update({ payout_id: null }).eq("payout_id", payoutId);
    await supabase.from("checklist_runs").update({ payout_id: null }).eq("payout_id", payoutId);
    await supabase.from("cleaning_events").update({ payout_id: null }).eq("payout_id", payoutId);
    const { error } = await supabase.from("payouts").delete().eq("id", payoutId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Payout deleted" }); fetchData(); }
  };

  const handleDeletePeriod = async (periodId: string) => {
    const { data: periodPayouts } = await supabase.from("payouts").select("id").eq("period_id", periodId);
    const payoutIds = (periodPayouts || []).map((p) => p.id);
    if (payoutIds.length > 0) {
      await supabase.from("log_hours").update({ payout_id: null }).in("payout_id", payoutIds);
      await supabase.from("checklist_runs").update({ payout_id: null }).in("payout_id", payoutIds);
      await supabase.from("cleaning_events").update({ payout_id: null }).in("payout_id", payoutIds);
      await supabase.from("payouts").delete().eq("period_id", periodId);
    }
    const { error } = await supabase.from("payout_periods").delete().eq("id", periodId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Period deleted" }); fetchData(); }
  };

  const payoutsForSummary = periodGroups.flatMap((group) => group.payouts);
  const payoutSummary = {
    periods: periodGroups.length,
    openPeriods: periodGroups.filter((group) => group.period.status !== "CLOSED").length,
    totalAmount: payoutsForSummary.reduce((sum, payout) => sum + getFinalAmount(payout), 0),
    outstandingAmount: Math.max(
      payoutsForSummary.reduce((sum, payout) => sum + getFinalAmount(payout), 0) -
        payoutsForSummary.reduce((sum, payout) => sum + getPaidAmount(payout), 0),
      0
    ),
  };
  const openPartialPaymentDialog = (payout: PayoutWithCleaner) => {
    setSelectedPayout(payout);
    setPartialAmount(String(Number(payout.partial_paid_amount || 0) || ""));
    setPartialDialogOpen(true);
  };
  const closePartialPaymentDialog = () => {
    setPartialDialogOpen(false);
    setSelectedPayout(null);
    setPartialAmount("");
    setSavingPartial(false);
  };
  const openAdjustmentDialog = (payout: PayoutWithCleaner) => {
    setSelectedPayout(payout);
    const adjustment = getManualAdjustmentAmount(payout);
    setAdjustmentAmount(adjustment === 0 ? "" : String(adjustment));
    setAdjustmentDialogOpen(true);
  };
  const closeAdjustmentDialog = () => {
    setAdjustmentDialogOpen(false);
    setSelectedPayout(null);
    setAdjustmentAmount("");
    setSavingAdjustment(false);
  };
  const savePartialPayment = async () => {
    if (!selectedPayout) return;
    const value = Number(partialAmount);
    const total = getFinalAmount(selectedPayout);
    if (!Number.isFinite(value)) {
      toast({ title: t("Select a partial amount"), description: t("Enter amount already paid"), variant: "destructive" });
      return;
    }
    if (value <= 0 || value >= total) {
      toast({ title: t("Partial payment"), description: t("Partial amount must be greater than 0 and less than the total payout."), variant: "destructive" });
      return;
    }
    setSavingPartial(true);
    const ok = await handleUpdatePayoutStatus(selectedPayout.id, "PARTIALLY_PAID", {
      partialPaidAmount: value,
      totalAmount: total,
    });
    if (ok) closePartialPaymentDialog();
    else setSavingPartial(false);
  };
  const saveManualAdjustment = async () => {
    if (!selectedPayout) return;
    const value = adjustmentAmount.trim() === "" ? 0 : Number(adjustmentAmount);
    if (!Number.isFinite(value)) {
      toast({ title: t("Manual adjustment"), description: t("Enter a valid positive or negative amount."), variant: "destructive" });
      return;
    }

    const calculatedAmount = getCalculatedAmount(selectedPayout);
    const finalAmount = Number((calculatedAmount + value).toFixed(2));
    if (finalAmount < 0) {
      toast({ title: t("Manual adjustment"), description: t("Adjustment cannot make the payout total negative."), variant: "destructive" });
      return;
    }

    const updates: PayoutUpdate = {
      calculated_amount: calculatedAmount,
      manual_adjustment_amount: value,
      total_amount: finalAmount,
    };

    if (selectedPayout.status === "PAID") {
      updates.partial_paid_amount = finalAmount;
    } else if (selectedPayout.status === "PARTIALLY_PAID") {
      const paidAmount = Number(selectedPayout.partial_paid_amount || 0);
      if (paidAmount > finalAmount) {
        toast({
          title: t("Manual adjustment"),
          description: t("Adjustment cannot reduce the total below the amount already paid."),
          variant: "destructive",
        });
        return;
      }
      if (paidAmount === finalAmount) {
        updates.status = "PAID";
        updates.paid_at = new Date().toISOString();
        updates.partial_paid_amount = finalAmount;
      }
    }

    setSavingAdjustment(true);
    const { error } = await supabase.from("payouts").update(updates).eq("id", selectedPayout.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSavingAdjustment(false);
      return;
    }

    toast({ title: t("Adjustment saved"), description: `${t("Final payout")}: €${finalAmount.toFixed(2)}` });
    closeAdjustmentDialog();
    fetchData();
  };

  return (
    <div>
      <PageHeader title={t("Payouts")} description={isHost ? t("Generate and manage payout periods") : t("Your payout history")} />
      <div className="max-w-5xl space-y-4 p-6">
        {isHost && (
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{t("Generate payouts for a period")}</p>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {t("Use this when a payout window is ready to lock. Generated payouts respect the current host earning model, including per-event pay plus extra logged hours when enabled.")}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? formatDate(startDate, "MMM d, yyyy") : t("Pick date")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus weekStartsOn={1} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">End Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? formatDate(endDate, "MMM d, yyyy") : t("Pick date")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus weekStartsOn={1} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button size="sm" onClick={handleGeneratePayouts} disabled={generating || !startDate || !endDate}>
                  <RefreshCw className={`mr-1 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                  {generating ? t("Generating...") : t("Generate Payouts")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Periods")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{payoutSummary.periods}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Open periods")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{payoutSummary.openPeriods}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Total due")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">€{payoutSummary.totalAmount.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Still pending")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">€{payoutSummary.outstandingAmount.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {loading && <p className="text-center text-muted-foreground py-8">{t("Loading...")}</p>}
        {!loading && periodGroups.length === 0 && (
            <div className="text-center py-12 space-y-3"><DollarSign className="h-10 w-10 mx-auto text-muted-foreground/50" /><p className="text-muted-foreground">{t("No payout periods yet.")}</p>
            {isHost && <p className="text-sm text-muted-foreground">{t("Select a date range above and click \"Generate Payouts\".")}</p>}
          </div>
        )}
        {periodGroups.map(({ period, payouts }) => {
          const isExpanded = expandedPeriods.has(period.id);
          const total = periodTotal(payouts);
          const adjustmentTotal = periodAdjustmentTotal(payouts);
          const mins = periodMinutes(payouts);
          const eventsCount = periodEvents(payouts);
          const isPaid = allPaid(payouts);
          const periodPaymentStatus = getPeriodPaymentStatus(payouts);
          return (
            <Card key={period.id}>
              <button onClick={() => togglePeriod(period.id)} className="w-full text-left">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <p className="font-semibold text-sm">{formatDate(period.start_date, "MMM d")} – {formatDate(period.end_date, "MMM d, yyyy")}</p>
                      <p className="text-xs text-muted-foreground">
                        {payouts.length} cleaner{payouts.length !== 1 ? "s" : ""}
                        {eventsCount > 0 ? ` · ${eventsCount} completed event${eventsCount !== 1 ? "s" : ""}` : ""}
                        {mins > 0 ? ` · ${Math.floor(mins / 60)}h ${mins % 60}m extra time` : ""}
                        {adjustmentTotal !== 0 ? ` · ${formatSignedCurrency(adjustmentTotal)} adjustments` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3"><div className="text-right"><p className="font-bold text-sm">€{total.toFixed(2)}</p><StatusBadge status={periodPaymentStatus || period.status} /></div></div>
                </CardContent>
              </button>
              {isExpanded && (
                <div className="border-t border-border">
                  {payouts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No payouts in this period.")}</p>}
                  {payouts.map((p) => {
                    const adjustment = getManualAdjustmentAmount(p);
                    const calculated = getCalculatedAmount(p);
                    const finalAmount = getFinalAmount(p);
                    return (
                      <div key={p.id} className="flex flex-col gap-3 px-6 py-3 border-b border-border last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.cleaner_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.payout_model === "PER_EVENT_PLUS_HOURLY"
                              ? [
                                  `${Number(p.event_count || 0)} event${Number(p.event_count || 0) === 1 ? "" : "s"} @ €${Number(p.event_rate_used || 0).toFixed(2)}`,
                                  Number(p.total_minutes || 0) > 0
                                    ? `+ ${p.total_minutes} extra min @ €${Number(p.hourly_rate_used).toFixed(2)}/hr`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" ")
                              : `${p.total_minutes} min @ €${Number(p.hourly_rate_used).toFixed(2)}/hr`}
                          </p>
                          {adjustment !== 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {t("Calculated")}: €{calculated.toFixed(2)} · {t("Adjustment")}: {formatSignedCurrency(adjustment)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="font-semibold text-sm">€{finalAmount.toFixed(2)}</p>
                            <StatusBadge status={p.status} />
                            {p.status === "PARTIALLY_PAID" && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {t("Paid amount")}: €{getPaidAmount(p).toFixed(2)} · {t("Remaining pending")}: €{getRemainingAmount(p).toFixed(2)}
                              </p>
                            )}
                          </div>
                           {isHost && (
                            <>
                              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openAdjustmentDialog(p)}>
                                <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                                {t("Adjust")}
                              </Button>
                              <Select
                                value={p.status}
                                onValueChange={(v) => {
                                  const nextStatus = v as PayoutStatus;
                                  if (nextStatus === "PARTIALLY_PAID") {
                                    openPartialPaymentDialog(p);
                                    return;
                                  }
                                  handleUpdatePayoutStatus(p.id, nextStatus, { totalAmount: finalAmount });
                                }}
                              >
                                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PENDING">{t("Pending")}</SelectItem>
                                  <SelectItem value="PARTIALLY_PAID">{t("Partially paid")}</SelectItem>
                                  <SelectItem value="PAID">{t("Paid")}</SelectItem>
                                </SelectContent>
                              </Select>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Delete payout?</AlertDialogTitle><AlertDialogDescription>This will unlink associated log hours. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePayout(p.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isHost && (
                    <div className="flex items-center justify-end gap-2 px-6 py-3 bg-muted/30">
                      {period.status === "OPEN" ? <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleUpdatePeriodStatus(period.id, "CLOSED"); }}>Close Period</Button> : <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleUpdatePeriodStatus(period.id, "OPEN"); }}>Reopen Period</Button>}
                      {payouts.length > 0 && !isPaid && <Button size="sm" onClick={async (e) => { e.stopPropagation(); for (const p of payouts) { if (p.status !== "PAID") await handleUpdatePayoutStatus(p.id, "PAID", { totalAmount: getFinalAmount(p) }); } }}>Mark All Paid</Button>}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" onClick={(e) => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete Period</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete entire period?</AlertDialogTitle><AlertDialogDescription>This will delete all payouts in this period and unlink associated log hours. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePeriod(period.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={partialDialogOpen} onOpenChange={(open) => !open && closePartialPaymentDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Partial payment")}</DialogTitle>
            <DialogDescription>
              {selectedPayout
                ? `${selectedPayout.cleaner_name} · €${getFinalAmount(selectedPayout).toFixed(2)}`
                : t("Enter amount already paid")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="partial-paid-amount">{t("Partial amount paid")}</Label>
              <Input
                id="partial-paid-amount"
                type="number"
                min="0"
                step="0.01"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {selectedPayout && (
              <p className="text-sm text-muted-foreground">
                {t("Remaining pending")}: €
                {Math.max(getFinalAmount(selectedPayout) - (Number(partialAmount) || 0), 0).toFixed(2)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePartialPaymentDialog}>{t("Cancel")}</Button>
            <Button onClick={savePartialPayment} disabled={savingPartial}>
              {savingPartial ? t("Saving...") : t("Save partial payment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustmentDialogOpen} onOpenChange={(open) => !open && closeAdjustmentDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Manual payout adjustment")}</DialogTitle>
            <DialogDescription>
              {selectedPayout
                ? `${selectedPayout.cleaner_name} · ${t("Calculated")}: €${getCalculatedAmount(selectedPayout).toFixed(2)}`
                : t("Add or subtract from the generated payout amount.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-adjustment-amount">{t("Adjustment amount")}</Label>
              <Input
                id="manual-adjustment-amount"
                type="number"
                step="0.01"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="-10.00 or 25.00"
              />
              <p className="text-xs text-muted-foreground">
                {t("Use a positive value to add money, or a negative value to subtract from the calculated payout.")}
              </p>
            </div>
            {selectedPayout && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Calculated")}</span>
                  <span>€{getCalculatedAmount(selectedPayout).toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Adjustment")}</span>
                  <span>{formatSignedCurrency(adjustmentAmount.trim() === "" || !Number.isFinite(Number(adjustmentAmount)) ? 0 : Number(adjustmentAmount))}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                  <span>{t("Final payout")}</span>
                  <span>
                    €{Math.max(
                      getCalculatedAmount(selectedPayout) + (adjustmentAmount.trim() === "" || !Number.isFinite(Number(adjustmentAmount)) ? 0 : Number(adjustmentAmount)),
                      0
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAdjustmentDialog}>{t("Cancel")}</Button>
            <Button onClick={saveManualAdjustment} disabled={savingAdjustment}>
              {savingAdjustment ? t("Saving...") : t("Save adjustment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
export default PayoutsPage;
