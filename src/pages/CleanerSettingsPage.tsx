import { useEffect, useMemo, useState, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Home, Clock, Mail, UserRound } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const CleanerSettingsPage = forwardRef<HTMLDivElement>(function CleanerSettingsPage(_props, _ref) {
  const { user, hostId } = useAuth();
  const { t } = useI18n();
  const [profileName, setProfileName] = useState<string>("");
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setProfileName(data?.name || ""));

    supabase
      .from("cleaner_assignments")
      .select("*, listings(name, default_checkin_time, default_checkout_time)")
      .eq("cleaner_user_id", user.id)
      .then(({ data }) => setAssignments(data || []));
  }, [user, hostId]);

  const defaultScheduleLabel = useMemo(() => {
    const firstAssignedListing = assignments.find((assignment) => assignment.listings);
    if (!firstAssignedListing?.listings) return t("Not assigned yet");
    const checkIn = firstAssignedListing.listings.default_checkin_time?.slice(0, 5) || "N/A";
    const checkOut = firstAssignedListing.listings.default_checkout_time?.slice(0, 5) || "N/A";
    return `${t("In:")} ${checkIn} · ${t("Out:")} ${checkOut}`;
  }, [assignments, t]);

  return (
    <div>
      <PageHeader
        title={t("Settings")}
        description={t("Your account and assigned listings")}
        actions={<LanguageSwitcher />}
      />
      <div className="max-w-4xl space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Assigned listings")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{assignments.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("Properties currently linked to your cleaner account.")}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Default handoff window")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{defaultScheduleLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("Based on the first assigned listing with saved check-in and check-out times.")}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("Account")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("Name")}</p>
                  <p className="text-sm font-medium">{profileName || t("Pending cleaner")}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("Email")}</p>
                  <p className="break-all text-sm font-medium">{user?.email || t("Unknown")}</p>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                {hostId
                  ? t("Your host can invite you to listings and you'll see them here once assigned.")
                  : t("Your host invitation is active. Listing access will appear here once the host assigns your first property.")}
              </div>
            </CardContent>
          </Card>

          {!hostId && (
            <Card className="border-dashed border-border/80 bg-card/70">
              <CardContent className="flex h-full items-center p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("No host connection found yet. If you already accepted an invitation, ask your host to check your email invite and listing assignments.")}
                </p>
              </CardContent>
            </Card>
          )}

          {hostId && (
            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" /> {t("Assigned Listings")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No listings assigned yet.")}</p>
                ) : (
                  <div className="space-y-3">
                    {assignments.map((a: any) => (
                      <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{a.listings?.name || t("Unknown")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t("Saved default arrival and departure times for this property.")}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{`${t("In:")} ${a.listings?.default_checkin_time?.slice(0, 5) || "N/A"}`}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{`${t("Out:")} ${a.listings?.default_checkout_time?.slice(0, 5) || "N/A"}`}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
});
export default CleanerSettingsPage;
