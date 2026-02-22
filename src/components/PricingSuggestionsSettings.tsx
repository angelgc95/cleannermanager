import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp } from "lucide-react";

interface PricingSuggestionsSettingsProps {
  settings: any;
  listings: any[];
  onUpdate: () => void;
}

export function PricingSuggestionsSettings({ settings, listings, onUpdate }: PricingSuggestionsSettingsProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean>(settings.nightly_price_suggestions_enabled ?? false);
  const [radiusKm, setRadiusKm] = useState<string>(String(settings.suggestion_radius_km ?? 10));
  const [daysAhead, setDaysAhead] = useState<string>(String(settings.suggestion_days_ahead ?? 90));
  const [minUplift, setMinUplift] = useState<string>(String(settings.min_uplift_pct ?? 0));
  const [maxUplift, setMaxUplift] = useState<string>(String(settings.max_uplift_pct ?? 30));
  const [refreshing, setRefreshing] = useState(false);

  const handleSave = async () => {
    const { error } = await supabase
      .from("host_settings")
      .update({
        nightly_price_suggestions_enabled: enabled,
        suggestion_radius_km: parseFloat(radiusKm),
        suggestion_days_ahead: parseInt(daysAhead),
        min_uplift_pct: parseFloat(minUplift),
        max_uplift_pct: parseFloat(maxUplift),
      })
      .eq("id", settings.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pricing settings updated" });
      onUpdate();
    }
  };

  const handleRefresh = async () => {
    if (listings.length === 0) {
      toast({ title: "No listings", description: "Add at least one listing with location data first.", variant: "destructive" });
      return;
    }
    setRefreshing(true);
    try {
      let totalSuggestions = 0;
      for (const listing of listings) {
        if (!listing.city && !listing.country_code) continue;
        const { data, error } = await supabase.functions.invoke("compute-price-suggestions", {
          body: { listing_id: listing.id },
        });
        if (error) throw error;
        totalSuggestions += data?.suggestions_count || 0;
      }
      toast({ title: "Refresh complete", description: `${totalSuggestions} price suggestions generated.` });
      onUpdate();
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Nightly Price Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Radius (km)</Label>
                <Input type="number" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} className="max-w-[200px]" />
              </div>
              <div className="space-y-1">
                <Label>Days Ahead</Label>
                <Input type="number" value={daysAhead} onChange={(e) => setDaysAhead(e.target.value)} className="max-w-[200px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Min Uplift (%)</Label>
                <Input type="number" step="0.5" value={minUplift} onChange={(e) => setMinUplift(e.target.value)} className="max-w-[200px]" />
              </div>
              <div className="space-y-1">
                <Label>Max Uplift (%)</Label>
                <Input type="number" step="0.5" value={maxUplift} onChange={(e) => setMaxUplift(e.target.value)} className="max-w-[200px]" />
              </div>
            </div>

            {settings.last_refreshed_at && (
              <p className="text-xs text-muted-foreground">
                Last refreshed: {new Date(settings.last_refreshed_at).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>Save</Button>
              <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Refreshing...</> : "Refresh Suggestions"}
              </Button>
            </div>
          </>
        )}

        {!enabled && <Button size="sm" onClick={handleSave}>Save</Button>}
      </CardContent>
    </Card>
  );
}
