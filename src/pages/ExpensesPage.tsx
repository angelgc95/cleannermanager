import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X } from "lucide-react";

export default function ExpensesPage() {
  const { user, hostId } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), name: "", amount: "", shop: "" });

  const fetchEntries = async () => {
    const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false }).limit(50);
    setEntries(data || []);
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !hostId) return;
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
      setShowForm(false);
      setForm({ date: format(new Date(), "yyyy-MM-dd"), name: "", amount: "", shop: "" });
      fetchEntries();
    }
  };

  return (
    <div>
      <PageHeader title="Expenses" description="Track cleaning-related expenses" actions={<Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Add Expense</>}</Button>} />
      <div className="p-6 space-y-4 max-w-2xl">
        {showForm && (
          <Card><CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Amount (€)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="What was purchased?" required /></div>
              <div className="space-y-1"><Label>Shop</Label><Input value={form.shop} onChange={(e) => setForm({ ...form, shop: e.target.value })} /></div>
              <Button type="submit">Save</Button>
            </form>
          </CardContent></Card>
        )}
        {entries.map((exp: any) => (
          <Card key={exp.id}><CardContent className="flex items-center justify-between p-4">
            <div><p className="font-medium text-sm">{exp.name}</p><p className="text-xs text-muted-foreground">{format(new Date(exp.date), "MMM d, yyyy")} · {exp.shop || "—"}</p></div>
            <span className="font-semibold text-sm">€{Number(exp.amount).toFixed(2)}</span>
          </CardContent></Card>
        ))}
        {entries.length === 0 && !showForm && <p className="text-center text-muted-foreground py-8">No expenses yet.</p>}
      </div>
    </div>
  );
}
