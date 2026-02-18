import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck } from "lucide-react";

type AuthMode = "login" | "host-signup" | "cleaner-signup";

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent, type: "host" | "cleaner") => {
    e.preventDefault();
    setLoading(true);

    if (type === "cleaner" && !inviteCode.trim()) {
      toast({ title: "Error", description: "Invite code is required.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: window.location.origin,
      },
    });

    if (signUpError) {
      toast({ title: "Error", description: signUpError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // If email confirmation is required, user won't have a session yet
    if (!signUpData.session) {
      toast({ title: "Check your email", description: "We sent you a confirmation link. After confirming, sign in and you'll be onboarded." });
      setLoading(false);
      return;
    }

    // Call onboard-user edge function
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: {
          type,
          org_name: type === "host" ? (orgName || name) : undefined,
          invite_code: type === "cleaner" ? inviteCode.trim() : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Welcome!", description: type === "host" ? "Your organization has been created." : `You've joined ${data.org_name || "the team"}.` });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Onboarding failed", description: err.message || "Please try again.", variant: "destructive" });
      // Sign out since onboarding failed
      await supabase.auth.signOut();
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
          <CardTitle className="text-2xl">Cleaning Manager</CardTitle>
          <CardDescription>
            {mode === "login" ? "Sign in to your account" : mode === "host-signup" ? "Create a new host account" : "Join as a cleaner"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : "Sign In"}
              </Button>
              <div className="text-center space-y-2 pt-2">
                <p className="text-sm text-muted-foreground">Don't have an account?</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setMode("host-signup")}>
                    Sign up as Host
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setMode("cleaner-signup")}>
                    Sign up as Cleaner
                  </Button>
                </div>
              </div>
            </form>
          ) : mode === "host-signup" ? (
            <form onSubmit={(e) => handleSignup(e, "host")} className="space-y-4">
              <div className="space-y-2">
                <Label>Your Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
              </div>
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="My Rental Business" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create Host Account"}
              </Button>
              <button type="button" onClick={() => setMode("login")} className="text-sm text-primary hover:underline w-full text-center">
                Already have an account? Sign in
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => handleSignup(e, "cleaner")} className="space-y-4">
              <div className="space-y-2">
                <Label>Your Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
              </div>
              <div className="space-y-2">
                <Label>Invite Code</Label>
                <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Enter code from your host" required />
                <p className="text-xs text-muted-foreground">Ask your host for the invite code</p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Joining..." : "Join as Cleaner"}
              </Button>
              <button type="button" onClick={() => setMode("login")} className="text-sm text-primary hover:underline w-full text-center">
                Already have an account? Sign in
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
