import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck } from "lucide-react";

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"choose" | "host" | "cleaner">("choose");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleOnboard = async (type: "host" | "cleaner") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: {
          type,
          org_name: type === "host" ? (orgName || user?.user_metadata?.name || "My Organization") : undefined,
          invite_code: type === "cleaner" ? inviteCode.trim() : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await refreshProfile();
      toast({
        title: "Welcome!",
        description: type === "host"
          ? "Your organization has been created."
          : `You've joined ${data.org_name || "the team"}.`,
      });
      navigate("/");
    } catch (err: any) {
      toast({
        title: "Onboarding failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <ClipboardCheck className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Complete Your Setup</CardTitle>
          <CardDescription>
            {mode === "choose"
              ? "How would you like to use Cleaning Manager?"
              : mode === "host"
              ? "Create your organization"
              : "Join an existing organization"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "choose" ? (
            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={() => setMode("host")}>
                I'm a Host — Create Organization
              </Button>
              <Button className="w-full" size="lg" variant="outline" onClick={() => setMode("cleaner")}>
                I'm a Cleaner — Join with Invite Code
              </Button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/auth");
                }}
                className="text-sm text-muted-foreground hover:underline w-full text-center mt-4 block"
              >
                Sign out
              </button>
            </div>
          ) : mode === "host" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="My Rental Business"
                />
              </div>
              <Button className="w-full" disabled={loading} onClick={() => handleOnboard("host")}>
                {loading ? "Creating..." : "Create Organization"}
              </Button>
              <button type="button" onClick={() => setMode("choose")} className="text-sm text-primary hover:underline w-full text-center">
                ← Back
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Invite Code</Label>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter code from your host"
                  required
                />
                <p className="text-xs text-muted-foreground">Ask your host for the invite code</p>
              </div>
              <Button
                className="w-full"
                disabled={loading || !inviteCode.trim()}
                onClick={() => handleOnboard("cleaner")}
              >
                {loading ? "Joining..." : "Join as Cleaner"}
              </Button>
              <button type="button" onClick={() => setMode("choose")} className="text-sm text-primary hover:underline w-full text-center">
                ← Back
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
