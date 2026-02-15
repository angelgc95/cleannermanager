import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X } from "lucide-react";

export default function MaintenancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ issue: "", priority: "MEDIUM" as string });

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("maintenance_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setTickets(data || []);
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("maintenance_tickets").insert([{
      created_by_user_id: user.id,
      issue: form.issue,
      priority: form.priority as "LOW" | "MEDIUM" | "HIGH",
    }]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ticket created" });
      setShowForm(false);
      setForm({ issue: "", priority: "MEDIUM" });
      fetchTickets();
    }
  };

  const priorityColor = (p: string) => {
    if (p === "HIGH") return "text-[hsl(var(--priority-high))]";
    if (p === "MEDIUM") return "text-[hsl(var(--priority-medium))]";
    return "text-muted-foreground";
  };

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Report and track maintenance issues"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Report Issue</>}
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label>Issue Description</Label>
                  <Textarea value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} placeholder="Describe the issue" required />
                </div>
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit">Submit</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {tickets.map((t: any) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{t.issue}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(t.created_at), "MMM d, yyyy")} · <span className={priorityColor(t.priority)}>{t.priority}</span>
                </p>
              </div>
              <StatusBadge status={t.status} />
            </CardContent>
          </Card>
        ))}
        {tickets.length === 0 && !showForm && <p className="text-center text-muted-foreground py-8">No maintenance tickets yet.</p>}
      </div>
    </div>
  );
}
