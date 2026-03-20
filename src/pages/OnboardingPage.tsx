import { forwardRef, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import { isNativeCleanerApp } from "@/lib/appVariant";

const OnboardingPage = forwardRef<HTMLDivElement>(function OnboardingPage(_props, _ref) {
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);
  const [canCreateHost, setCanCreateHost] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const cleanerOnlyApp = isNativeCleanerApp();

  useEffect(() => {
    if (cleanerOnlyApp) {
      setAccessLoading(false);
      setCanCreateHost(false);
      return;
    }

    let mounted = true;

    const loadHostAccess = async () => {
      setAccessLoading(true);
      try {
        const [{ data: inviteData, error: inviteError }, { data: adminData, error: adminError }] = await Promise.all([
          supabase.functions.invoke("manage-host-access", {
            body: { action: "get_my_invite" },
          }),
          supabase.functions.invoke("manage-host-access", {
            body: { action: "get_admin_status" },
          }),
        ]);

        if (inviteError) throw inviteError;
        if (adminError) throw adminError;

        if (!mounted) return;
        setCanCreateHost(Boolean(inviteData?.invite || adminData?.is_admin));
      } catch (err: any) {
        if (!mounted) return;
        setCanCreateHost(false);
        toast({
          title: t("Error"),
          description: err.message || t("Unable to validate host access right now."),
          variant: "destructive",
        });
      } finally {
        if (mounted) {
          setAccessLoading(false);
        }
      }
    };

    void loadHostAccess();
    return () => {
      mounted = false;
    };
  }, [toast, t, cleanerOnlyApp]);

  const handleOnboard = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type: "host" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await refreshProfile();
      toast({
        title: t("Welcome!"),
        description: t("Your host account is ready."),
      });
      navigate("/");
    } catch (err: any) {
      toast({
        title: t("Onboarding failed"),
        description: err.message || t("Please try again."),
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
          <CardTitle className="text-2xl">{t("Complete Your Setup")}</CardTitle>
          <CardDescription>
            {cleanerOnlyApp ? t("This Android app is only for invited cleaners.") : t("Set up your host account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {cleanerOnlyApp ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {t("Ask your host to invite this email and finish setup from the invitation link.")}
              </div>
            ) : accessLoading ? (
              <Button className="w-full" disabled>
                {`${t("Loading...").replace("...", "")}...`}
              </Button>
            ) : canCreateHost ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("As a host, you can add listings, invite cleaners by email, manage checklists, and configure payouts.")}
                </p>
                <Button className="w-full" disabled={loading} onClick={handleOnboard}>
                  {loading ? `${t("Loading...").replace("...", "")}...` : t("Continue as Host")}
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {t("Host accounts are invitation-only. Ask the owner to approve this email before continuing.")}
              </div>
            )}
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth");
              }}
              className="text-sm text-muted-foreground hover:underline w-full text-center mt-4 block"
            >
              {t("Sign out")}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
export default OnboardingPage;
