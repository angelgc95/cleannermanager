import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/LanguageProvider";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";

const CleanerAppAccessPage = forwardRef<HTMLDivElement>(function CleanerAppAccessPage(_props, _ref) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { t } = useI18n();

  const isHost = role === "host";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 cleaner-theme">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <ClipboardCheck className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">{t("Cleaner app only")}</CardTitle>
          <CardDescription>
            {isHost ? t("This Android app is only for cleaners. Use the web dashboard for host management.") : t("This Android app is only for invited cleaners. Ask your host to invite this email and finish setup from the invitation link.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isHost && (
            <Button asChild className="w-full">
              <a href={buildPublicAppUrl("/auth")} target="_blank" rel="noreferrer">
                {t("Open web dashboard")}
              </a>
            </Button>
          )}
          <Button
            variant={isHost ? "outline" : "default"}
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/auth", { replace: true });
            }}
          >
            {t("Sign Out")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
});

export default CleanerAppAccessPage;
