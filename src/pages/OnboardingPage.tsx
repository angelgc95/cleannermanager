import { forwardRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";

const OnboardingPage = forwardRef<HTMLDivElement>(function OnboardingPage(_props, _ref) {
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

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
            {t("Set up your host account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("As a host, you can add listings, invite cleaners by email, manage checklists, and configure payouts.")}
            </p>
            <Button className="w-full" disabled={loading} onClick={handleOnboard}>
              {loading ? `${t("Loading...").replace("...", "")}...` : t("Continue as Host")}
            </Button>
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
