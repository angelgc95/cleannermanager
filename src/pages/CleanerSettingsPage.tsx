import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Home, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function CleanerSettingsPage() {
  const { user, hostId } = useAuth();
  const { toast } = useToast();
  const [uniqueCode, setUniqueCode] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    // Get unique code
    supabase
      .from("profiles")
      .select("unique_code")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setUniqueCode(data?.unique_code || null));

    // Get assigned listings
    if (hostId) {
      supabase
        .from("cleaner_assignments")
        .select("*, listings(name, default_checkin_time, default_checkout_time)")
        .eq("cleaner_user_id", user.id)
        .then(({ data }) => setAssignments(data || []));
    }
  }, [user, hostId]);

  const copyCode = () => {
    if (uniqueCode) {
      navigator.clipboard.writeText(uniqueCode);
      toast({ title: "Copied!", description: "Your unique code has been copied." });
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Your account and assigned listings" />
      <div className="p-6 space-y-4 max-w-2xl">
        {/* Unique Code */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Cleaner ID</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <code className="bg-muted px-4 py-2 rounded-lg text-lg font-mono font-bold tracking-widest">
                {uniqueCode || "Loading..."}
              </code>
              <Button variant="outline" size="icon" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this code with your host so they can assign you to listings.
            </p>
          </CardContent>
        </Card>

        {/* Assignment Status */}
        {!hostId && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground text-sm">
                You're not assigned to any host yet. Share your Cleaner ID with a host to get started.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Assigned Listings */}
        {hostId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="h-4 w-4" /> Assigned Listings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No listings assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{a.listings?.name || "Unknown"}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>In: {a.listings?.default_checkin_time?.slice(0, 5) || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Out: {a.listings?.default_checkout_time?.slice(0, 5) || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
