import { useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import { getPublicAppOrigin } from "@/lib/publicAppUrl";
import { isNativeCleanerApp } from "@/lib/appVariant";

type AuthMode = "login" | "host-signup";

const Auth = forwardRef<HTMLDivElement>(function Auth(_props, _ref) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const cleanerOnlyApp = isNativeCleanerApp();
  const currentMode: AuthMode = cleanerOnlyApp ? "login" : mode;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: t("Error"), description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("manage-host-access", {
        body: { action: "check_email", email },
      });

      if (error) throw error;
      if (!data?.authorized) {
        toast({
          title: t("Host sign up requires approval"),
          description: t("Host accounts are invitation-only. Ask the owner to approve this email before signing up."),
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
    } catch (err: any) {
      toast({
        title: t("Error"),
        description: err.message || t("Unable to validate host access right now."),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
        password,
        options: {
          data: { name },
          emailRedirectTo: getPublicAppOrigin(),
        },
      });

    if (signUpError) {
      toast({ title: t("Error"), description: signUpError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!signUpData.session) {
      toast({
        title: t("Check your email"),
        description: t("We sent you a confirmation link. After confirming, sign in and you'll be onboarded."),
      });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type: "host" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t("Welcome!"),
        description: t("Your host account is ready."),
      });
      navigate("/");
    } catch (err: any) {
      toast({ title: t("Onboarding failed"), description: err.message || t("Please try again."), variant: "destructive" });
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
          <CardTitle className="text-2xl">CleannerManager</CardTitle>
          <CardDescription>
            {cleanerOnlyApp ? t("Sign in to your cleaner account") : currentMode === "login" ? t("Sign in to your account") : t("Create a new host account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentMode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("Email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("Password")}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("Loading...") : t("Sign In")}
              </Button>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {t("Cleaners are invited by their host. Use the invitation link from your email to finish your account setup.")}
              </div>
              {!cleanerOnlyApp && (
                <div className="text-center space-y-2 pt-2">
                  <p className="text-sm text-muted-foreground">{t("Need a host account?")}</p>
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setMode("host-signup")}>
                    {t("Sign up as Host")}
                  </Button>
                </div>
              )}
            </form>
          ) : currentMode === "host-signup" ? (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {t("Host accounts are invitation-only. Use an approved email address to sign up.")}
              </div>
              <div className="space-y-2">
                <Label>{t("Your Name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Your name")} required />
              </div>
              <div className="space-y-2">
                <Label>{t("Email")}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>{t("Password")}</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? `${t("Creating")}...` : t("Create Host Account")}
              </Button>
              <button type="button" onClick={() => setMode("login")} className="text-sm text-primary hover:underline w-full text-center">
                {t("Already have an account? Sign in")}
              </button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
});
export default Auth;
