import { useEffect, useState, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";

const CompleteCleanerProfilePage = forwardRef<HTMLDivElement>(function CompleteCleanerProfilePage(_props, _ref) {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const profileName = data?.name?.trim();
        if (profileName && profileName !== user.email) {
          setName(profileName);
        }
      });
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      toast({ title: t("Error"), description: t("Please enter your name."), variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: t("Error"), description: t("Password must be at least 6 characters."), variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: t("Error"), description: t("Passwords do not match."), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({
        password,
        data: { name: name.trim() },
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          name: name.trim(),
          email: user.email ?? null,
          setup_completed: true,
        })
        .eq("user_id", user.id);
      if (profileError) throw profileError;

      await refreshProfile();
      toast({ title: t("Profile ready"), description: t("Your cleaner account is ready.") });
      navigate("/");
    } catch (error: any) {
      toast({ title: t("Error"), description: error.message || t("Please try again."), variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
          <CardTitle className="text-2xl">{t("Finish your cleaner profile")}</CardTitle>
          <CardDescription>
            {t("Complete your account to access the cleaner web app.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t("Email")}</Label>
              <Input id="invite-email" value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">{t("Full name")}</Label>
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Your name")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">{t("Create password")}</Label>
              <Input id="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password-confirm">{t("Confirm password")}</Label>
              <Input id="invite-password-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Complete setup")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});

export default CompleteCleanerProfilePage;
