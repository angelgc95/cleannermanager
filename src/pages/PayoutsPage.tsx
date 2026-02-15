import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("payouts")
        .select("*, profiles:cleaner_user_id(name), payout_periods:period_id(start_date, end_date)")
        .order("created_at", { ascending: false });
      setPayouts(data || []);
    };
    fetch();
  }, []);

  return (
    <div>
      <PageHeader title="Payouts" description="Manage cleaner payouts and history" />
      <div className="p-6 space-y-4 max-w-2xl">
        {payouts.length === 0 && <p className="text-center text-muted-foreground py-8">No payouts yet.</p>}
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
