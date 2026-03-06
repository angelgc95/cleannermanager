import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";
import { supabase } from "@/integrations/supabase/client";

type EventRow = {
  id: string;
  listing_id: string;
  start_at: string;
  status: string;
};

export default function ExtrasPage() {
  const { user, organizationsV1, organizationId } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [suppliesEventId, setSuppliesEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [hoursMinutes, setHoursMinutes] = useState("60");
  const [hoursNote, setHoursNote] = useState("");

  const [shoppingItem, setShoppingItem] = useState("");
  const [shoppingQty, setShoppingQty] = useState("1");

  const [maintenanceDescription, setMaintenanceDescription] = useState("");

  const [expenseAmount, setExpenseAmount] = useState("0");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseNote, setExpenseNote] = useState("");

  useEffect(() => {
    if (organizationsV1.length === 1) {
      setSelectedOrgId(organizationsV1[0].id);
      return;
    }

    if (organizationId && organizationsV1.some((organization) => organization.id === organizationId)) {
      setSelectedOrgId(organizationId);
      return;
    }

    setSelectedOrgId(null);
  }, [organizationId, organizationsV1]);

  useEffect(() => {
    if (!user?.id || !selectedOrgId) {
      setEvents([]);
      setSuppliesEventId(null);
      return;
    }

    const loadEvents = async () => {
      const { data } = await db
        .from("v1_events")
        .select("id, listing_id, start_at, status")
        .eq("organization_id", selectedOrgId)
        .eq("assigned_cleaner_id", user.id)
        .neq("status", "CANCELLED")
        .order("start_at", { ascending: true })
        .limit(50);

      const rows = (data || []) as EventRow[];
      setEvents(rows);
      if (rows.length > 0) {
        setSuppliesEventId(rows[0].id);
      } else {
        setSuppliesEventId(null);
      }
    };

    loadEvents();
  }, [selectedOrgId, user?.id]);

  const requiresSelection = organizationsV1.length > 1 && !selectedOrgId;

  const orgLabel = useMemo(() => organizationsV1.find((organization) => organization.id === selectedOrgId)?.name || "", [organizationsV1, selectedOrgId]);

  const submitHours = async () => {
    if (!user?.id || !selectedOrgId) return;
    await db.from("v1_hours_entries").insert({
      organization_id: selectedOrgId,
      cleaner_id: user.id,
      minutes: Number(hoursMinutes || 0),
      note: hoursNote || null,
      event_id: null,
      run_id: null,
    });
    setMessage(`Hours saved for ${orgLabel || selectedOrgId}.`);
    setHoursNote("");
  };

  const submitShopping = async () => {
    if (!user?.id || !selectedOrgId || !shoppingItem.trim()) return;
    await db.from("v1_shopping_entries").insert({
      organization_id: selectedOrgId,
      cleaner_id: user.id,
      event_id: null,
      run_id: null,
      item: shoppingItem.trim(),
      qty: Number(shoppingQty || 1),
    });
    setMessage(`Shopping item saved for ${orgLabel || selectedOrgId}.`);
    setShoppingItem("");
  };

  const submitMaintenance = async () => {
    if (!user?.id || !selectedOrgId || !maintenanceDescription.trim()) return;
    await db.from("v1_maintenance_entries").insert({
      organization_id: selectedOrgId,
      cleaner_id: user.id,
      event_id: null,
      run_id: null,
      description: maintenanceDescription.trim(),
    });
    setMessage(`Maintenance report saved for ${orgLabel || selectedOrgId}.`);
    setMaintenanceDescription("");
  };

  const submitExpense = async () => {
    if (!user?.id || !selectedOrgId) return;
    await db.from("v1_expenses").insert({
      organization_id: selectedOrgId,
      event_id: null,
      amount: Number(expenseAmount || 0),
      category: expenseCategory || null,
      note: expenseNote || null,
      created_by: user.id,
    });
    setMessage(`Expense saved for ${orgLabel || selectedOrgId}.`);
    setExpenseCategory("");
    setExpenseNote("");
  };

  const reportSuppliesLow = async () => {
    if (!selectedOrgId || !suppliesEventId) return;
    setMessage(null);

    const { data, error } = await supabase.functions.invoke("run-automations-v1", {
      body: {
        organization_id: selectedOrgId,
        trigger_type: "SUPPLIES_LOW",
        event_id: suppliesEventId,
      },
    });

    if (error || data?.error) {
      setMessage(error?.message || data?.error || "Supplies low report failed.");
      return;
    }

    setMessage("Supplies low exception created and automations evaluated.");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Manual Extras</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {organizationsV1.length > 1 && (
            <div className="space-y-1">
              <Label>Organization (required)</Label>
              <Select value={selectedOrgId || "__none"} onValueChange={(value) => setSelectedOrgId(value === "__none" ? null : value)}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select organization</SelectItem>
                  {organizationsV1.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {requiresSelection && <p className="text-xs text-amber-600">Select Organization before submitting manual entries.</p>}

          <div className="space-y-2 border-t border-border pt-2">
            <p className="text-xs font-medium text-muted-foreground">Supplies low (quick action)</p>
            <Select
              value={suppliesEventId || "__none"}
              onValueChange={(value) => setSuppliesEventId(value === "__none" ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select event</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {new Date(event.start_at).toLocaleString()} · {event.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={reportSuppliesLow} disabled={requiresSelection || !suppliesEventId}>
              Report Supplies Low
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="hours" className="space-y-3">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="shopping">Shopping</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="hours">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1"><Label>Minutes</Label><Input type="number" value={hoursMinutes} onChange={(event) => setHoursMinutes(event.target.value)} /></div>
              <div className="space-y-1"><Label>Note</Label><Textarea value={hoursNote} onChange={(event) => setHoursNote(event.target.value)} /></div>
              <Button onClick={submitHours} disabled={requiresSelection}>Save Hours</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shopping">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1"><Label>Item</Label><Input value={shoppingItem} onChange={(event) => setShoppingItem(event.target.value)} /></div>
              <div className="space-y-1"><Label>Qty</Label><Input type="number" value={shoppingQty} onChange={(event) => setShoppingQty(event.target.value)} /></div>
              <Button onClick={submitShopping} disabled={requiresSelection || !shoppingItem.trim()}>Save Shopping</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1"><Label>Description</Label><Textarea value={maintenanceDescription} onChange={(event) => setMaintenanceDescription(event.target.value)} /></div>
              <Button onClick={submitMaintenance} disabled={requiresSelection || !maintenanceDescription.trim()}>Save Maintenance</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} /></div>
              <div className="space-y-1"><Label>Category</Label><Input value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} /></div>
              <div className="space-y-1"><Label>Note</Label><Textarea value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} /></div>
              <Button onClick={submitExpense} disabled={requiresSelection}>Save Expense</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
