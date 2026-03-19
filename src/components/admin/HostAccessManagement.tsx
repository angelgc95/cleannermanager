import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/LanguageProvider";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MailPlus, ShieldCheck, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

interface HostInviteRecord {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  created_at: string;
  accepted_at: string | null;
}

export function HostAccessManagement() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invites, setInvites] = useState<HostInviteRecord[]>([]);

  const loadInvites = async () => {
    setLoadingInvites(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-host-access", {
        body: { action: "list_invites" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInvites((data?.invites || []) as HostInviteRecord[]);
    } catch (error: any) {
      toast({ title: t("Error"), description: error.message || t("Unable to load host access."), variant: "destructive" });
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadAdminStatus = async () => {
      setStatusLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("manage-host-access", {
          body: { action: "get_admin_status" },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (!mounted) return;
        const admin = Boolean(data?.is_admin);
        setIsAdmin(admin);
        if (admin) {
          await loadInvites();
        }
      } catch {
        if (mounted) {
          setIsAdmin(false);
        }
      } finally {
        if (mounted) {
          setStatusLoading(false);
        }
      }
    };

    void loadAdminStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthorize = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-host-access", {
        body: { action: "authorize_host_email", email },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t("Host access updated"),
        description: t("This email can now create a host account."),
      });
      setInviteEmail("");
      await loadInvites();
    } catch (error: any) {
      toast({ title: t("Error"), description: error.message || t("Unable to authorize this email."), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-host-access", {
        body: { action: "revoke_invite", invite_id: inviteId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t("Host access revoked"),
        description: t("This email can no longer sign up as a host."),
      });
      await loadInvites();
    } catch (error: any) {
      toast({ title: t("Error"), description: error.message || t("Unable to revoke this invite."), variant: "destructive" });
    }
  };

  if (statusLoading || !isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> {t("Host Access")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t("Hosts are invitation-only. Approve each email here before they can create a host account.")}
        </div>

        <div className="flex gap-2">
          <Input
            type="email"
            placeholder={t("Authorize host email")}
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAuthorize} disabled={saving || !inviteEmail.trim()} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><MailPlus className="h-4 w-4 mr-1" /> {t("Authorize")}</>}
          </Button>
        </div>

        {loadingInvites ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Loading...")}
          </div>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No host invitations yet.")}</p>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm break-all">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Authorized on")} {new Date(invite.created_at).toLocaleString()}
                    </p>
                    {invite.accepted_at && (
                      <p className="text-xs text-muted-foreground">
                        {t("Accepted on")} {new Date(invite.accepted_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        invite.status === "PENDING" && "bg-amber-500/10 text-amber-700",
                        invite.status === "ACCEPTED" && "bg-emerald-500/10 text-emerald-700",
                        invite.status === "REVOKED" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {invite.status === "PENDING" ? t("Pending") : invite.status === "ACCEPTED" ? t("Accepted") : t("Revoked")}
                    </span>
                    {invite.status === "PENDING" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRevoke(invite.id)}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
