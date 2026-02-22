import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Copy } from "lucide-react";

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"choose" | "host" | "cleaner">("choose");
  const [loading, setLoading] = useState(false);
  const [cleanerCode, setCleanerCode] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleOnboard = async (type: "host" | "cleaner") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (type === "cleaner" && data?.unique_code) {
        setCleanerCode(data.unique_code);
        setLoading(false);
        return;
      }

      await refreshProfile();
      toast({
        title: "Welcome!",
        description: type === "host"
          ? "Your host account is ready."
          : "Account set up! Share your code with a host.",
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

  const copyCode = () => {
    if (cleanerCode) {
      navigator.clipboard.writeText(cleanerCode);
      toast({ title: "Copied!", description: "Your unique code has been copied." });
    }
  };

  if (cleanerCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                <ClipboardCheck className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Your Cleaner ID</CardTitle>
            <CardDescription>
              Share this code with your host so they can assign you to listings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <code className="bg-muted px-6 py-3 rounded-lg text-2xl font-mono font-bold tracking-widest">
                {cleanerCode}
              </code>
              <Button variant="outline" size="icon" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Once your host assigns you to listings, you'll see your calendar and checklists here.
            </p>
            <Button className="w-full" onClick={async () => {
              await refreshProfile();
              navigate("/");
            }}>
              Done — Go to App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              ? "Set up your host account"
              : "Set up your cleaner account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "choose" ? (
            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={() => setMode("host")}>
                I'm a Host
              </Button>
              <Button className="w-full" size="lg" variant="outline" onClick={() => setMode("cleaner")}>
                I'm a Cleaner
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
              <p className="text-sm text-muted-foreground">
                As a host, you can add listings, assign cleaners, manage checklists, and configure payouts.
              </p>
              <Button className="w-full" disabled={loading} onClick={() => handleOnboard("host")}>
                {loading ? "Setting up..." : "Continue as Host"}
              </Button>
              <button type="button" onClick={() => setMode("choose")} className="text-sm text-primary hover:underline w-full text-center">
                ← Back
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You'll receive a unique code to share with your host. They'll use it to assign you to listings.
              </p>
              <Button className="w-full" disabled={loading} onClick={() => handleOnboard("cleaner")}>
                {loading ? "Setting up..." : "Continue as Cleaner"}
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
