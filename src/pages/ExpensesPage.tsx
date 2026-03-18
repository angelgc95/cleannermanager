import { useEffect, useState, useMemo, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Plus, X, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/LanguageProvider";

const ExpensesPage = forwardRef<HTMLDivElement>(function ExpensesPage(_props, _ref) {
  const { user, hostId, role } = useAuth();
  const { toast } = useToast();
  const { formatDate, t } = useI18n();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), name: "", amount: "", shop: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [orgSettings, setOrgSettings] = useState<any>(null);

  const isAdmin = role === "host";

  const fetchEntries = async () => {
    const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false }).limit(50);
    setEntries(data || []);
  };

  useEffect(() => { fetchEntries(); }, []);

  useEffect(() => {
    const fetchHostSettings = async () => {
      const settingsOwnerId = hostId || user?.id;
      if (!settingsOwnerId) return;
      const { data } = await supabase
        .from("host_settings")
        .select("expense_grouping, payout_week_end_day")
        .eq("host_user_id", settingsOwnerId)
        .maybeSingle();
      setOrgSettings(data || null);
    };

    fetchHostSettings();
  }, [hostId, user]);

  const resetForm = () => {
    setForm({ date: format(new Date(), "yyyy-MM-dd"), name: "", amount: "", shop: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !hostId) return;

    if (editingId) {
      const { error } = await supabase.from("expenses").update({
        date: form.date,
        name: form.name,
        amount: parseFloat(form.amount),
        shop: form.shop,
      }).eq("id", editingId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Expense updated" });
        resetForm();
        fetchEntries();
      }
      return;
    }

    const { error } = await supabase.from("expenses").insert({
      created_by_user_id: user.id,
      date: form.date,
      name: form.name,
      amount: parseFloat(form.amount),
      shop: form.shop,
      host_user_id: hostId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Expense added" });
      resetForm();
      fetchEntries();
    }
  };

  const startEdit = (exp: any) => {
    setForm({ date: exp.date, name: exp.name, amount: String(exp.amount), shop: exp.shop || "" });
    setEditingId(exp.id);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from("expenses").delete().eq("id", deleteId);
    setDeleting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Expense deleted" });
      setDeleteId(null);
      fetchEntries();
    }
  };

  const grouped = useMemo(() => {
    const grouping = orgSettings?.expense_grouping ?? "MONTHLY";
    const weekEndDay = Number(orgSettings?.payout_week_end_day ?? 0);
    const weekStartsOn = ((weekEndDay + 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const groups: Record<string, { expenses: any[]; total: number; label: string }> = {};

    for (const exp of entries) {
      const expenseDate = parseISO(exp.date);
      let key: string;
      let label: string;

      if (grouping === "PAYOUT_WEEK") {
        const periodStart = startOfWeek(expenseDate, { weekStartsOn });
        const periodEnd = addDays(periodStart, 6);
        key = `${format(periodStart, "yyyy-MM-dd")}_${format(periodEnd, "yyyy-MM-dd")}`;
        label = `${formatDate(periodStart, "MMM d")} – ${formatDate(periodEnd, "MMM d, yyyy")}`;
      } else {
        key = format(expenseDate, "yyyy-MM");
        label = formatDate(parseISO(`${key}-01`), "MMMM yyyy");
      }

      if (!groups[key]) groups[key] = { expenses: [], total: 0, label };
      groups[key].expenses.push(exp);
      groups[key].total += Number(exp.amount);
    }

    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [entries, formatDate, orgSettings]);

  return (
    <div>
      <PageHeader title={t("Expenses")} description={t("Track cleaning-related expenses")} actions={<Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>{showForm ? <><X className="h-4 w-4 mr-1" /> {t("Cancel")}</> : <><Plus className="h-4 w-4 mr-1" /> {t("Add Expense")}</>}</Button>} />
      <div className="p-6 space-y-6 max-w-2xl">
        {showForm && (
          <Card><CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Amount (€)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="What was purchased?" required /></div>
              <div className="space-y-1"><Label>Shop</Label><Input value={form.shop} onChange={(e) => setForm({ ...form, shop: e.target.value })} /></div>
              <Button type="submit">{editingId ? "Update" : "Save"}</Button>
            </form>
          </CardContent></Card>
        )}
        {grouped.map(([groupKey, { expenses, total, label }]) => (
          <div key={groupKey}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
              </h3>
              <span className="text-sm font-semibold">€{total.toFixed(2)}</span>
            </div>
            <div className="space-y-2">
              {expenses.map((exp: any) => (
                <Card key={exp.id}><CardContent className="flex items-center justify-between p-4">
                  <div><p className="font-medium text-sm">{exp.name}</p><p className="text-xs text-muted-foreground">{formatDate(parseISO(exp.date), "MMM d")} · {exp.shop || "—"}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">€{Number(exp.amount).toFixed(2)}</span>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(exp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(exp.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent></Card>
              ))}
            </div>
          </div>
        ))}
        {entries.length === 0 && !showForm && <p className="text-center text-muted-foreground py-8">No expenses yet.</p>}
      </div>

      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete expense?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
export default ExpensesPage;
