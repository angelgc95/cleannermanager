import { useEffect, useState, useMemo, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Plus, X, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const ExpensesPage = forwardRef<HTMLDivElement>(function ExpensesPage(_props, _ref) {
  const { user, hostId, hostIds, role } = useAuth();
  const { organizations, organizationId, setOrganizationId } = useOrg();
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), name: "", amount: "", shop: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = role === "host";
  const isCleaner = role === "cleaner";
  const requiresOrganizationSelection = isCleaner && organizations.length > 1 && !organizationId;
  const resolvedOrganizationId = organizationId || hostId || (isAdmin ? user?.id ?? null : null);

  const fetchEntries = async () => {
    if (!user) return;

    let query = supabase.from("expenses").select("*").order("date", { ascending: false }).limit(50);
    if (isAdmin) {
      query = query.eq("host_user_id", user.id);
    } else {
      if (hostIds.length === 0) {
        setEntries([]);
        return;
      }
      query = query.in("host_user_id", hostIds);
    }

    const { data } = await query;
    setEntries(data || []);
  };

  useEffect(() => { fetchEntries(); }, [user, isAdmin, hostIds.join(",")]);

  const resetForm = () => {
    setForm({ date: format(new Date(), "yyyy-MM-dd"), name: "", amount: "", shop: "" });
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

    if (editingId) {
      const { error } = await supabase.from("expenses").update({
        date: form.date,
        name: form.name,
        amount: parseFloat(form.amount),
        shop: form.shop,
        host_user_id: resolvedOrganizationId,
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
      host_user_id: resolvedOrganizationId,
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
    const groups: Record<string, { expenses: any[]; total: number }> = {};
    for (const exp of entries) {
      const key = format(parseISO(exp.date), "yyyy-MM");
      if (!groups[key]) groups[key] = { expenses: [], total: 0 };
      groups[key].expenses.push(exp);
      groups[key].total += Number(exp.amount);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [entries]);

  return (
    <div>
      <PageHeader title="Expenses" description="Track cleaning-related expenses" actions={<Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>{showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Add Expense</>}</Button>} />
      <div className="p-6 space-y-6 max-w-2xl">
        {showForm && (
          <Card><CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isCleaner && organizations.length > 1 && (
                <div className="space-y-1">
                  <Label>Organization</Label>
                  <Select value={organizationId || "__none"} onValueChange={(value) => setOrganizationId(value === "__none" ? null : value)}>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Amount (€)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="What was purchased?" required /></div>
              <div className="space-y-1"><Label>Shop</Label><Input value={form.shop} onChange={(e) => setForm({ ...form, shop: e.target.value })} /></div>
              <Button type="submit" disabled={requiresOrganizationSelection}>{editingId ? "Update" : "Save"}</Button>
            </form>
          </CardContent></Card>
        )}
        {grouped.map(([monthKey, { expenses, total }]) => (
          <div key={monthKey}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {format(parseISO(monthKey + "-01"), "MMMM yyyy")}
              </h3>
              <span className="text-sm font-semibold">€{total.toFixed(2)}</span>
            </div>
            <div className="space-y-2">
              {expenses.map((exp: any) => (
                <Card key={exp.id}><CardContent className="flex items-center justify-between p-4">
                  <div><p className="font-medium text-sm">{exp.name}</p><p className="text-xs text-muted-foreground">{format(parseISO(exp.date), "MMM d")} · {exp.shop || "—"}</p></div>
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
