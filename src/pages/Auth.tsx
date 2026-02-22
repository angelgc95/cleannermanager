import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Copy } from "lucide-react";

type AuthMode = "login" | "host-signup" | "cleaner-signup";

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [cleanerCode, setCleanerCode] = useState<string | null>(null);
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

    if (!signUpData.session) {
      toast({ title: "Check your email", description: "We sent you a confirmation link. After confirming, sign in and you'll be onboarded." });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (type === "cleaner" && data?.unique_code) {
        // Show the cleaner their unique code before navigating
        setCleanerCode(data.unique_code);
        setLoading(false);
        return;
      }

      toast({ title: "Welcome!", description: type === "host" ? "Your host account is ready." : "Account created! Share your code with a host to get added." });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Onboarding failed", description: err.message || "Please try again.", variant: "destructive" });
      await supabase.auth.signOut();
    }

    setLoading(false);
  };

  const copyCode = () => {
    if (cleanerCode) {
      navigator.clipboard.writeText(cleanerCode);
      toast({ title: "Copied!", description: "Your unique code has been copied." });
    }
  };

  // Show cleaner code screen after signup
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
            <CardTitle className="text-2xl">Welcome, Cleaner!</CardTitle>
            <CardDescription>
              Your unique ID has been generated. Share it with your host so they can assign you to listings.
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
              Once your host adds you, you'll be able to see your assigned listings.
            </p>
            <Button className="w-full" onClick={() => navigate("/")}>
              Continue
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
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <p className="text-xs text-muted-foreground">
                After signing up, you'll receive a unique code. Share it with your host to get assigned to listings.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Sign Up as Cleaner"}
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
