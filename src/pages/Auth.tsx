import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    navigate("/");
  };

  const signUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setMessage("Account created. Confirm email, then sign in.");
      setLoading(false);
      return;
    }

    const { data: onboardData, error: onboardError } = await supabase.functions.invoke("onboard-organization", {
      body: { organization_name: organizationName || `${name || "New"} Organization` },
    });

    if (onboardError || onboardData?.error) {
      setMessage(onboardError?.message || onboardData?.error || "Onboarding failed.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    setLoading(false);
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Foundation V1</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Sign in to continue" : "Create your organization workspace"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={mode === "signin" ? signIn : signUp}>
            {mode === "signup" && (
              <>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Organization</Label>
                  <Input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Acme Operations" required />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
            </Button>
          </form>

          <Button
            variant="link"
            className="mt-2 h-auto p-0"
            onClick={() => {
              setMessage(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Button>

          {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
