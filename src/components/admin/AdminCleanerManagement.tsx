import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Home, Mail, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/LanguageProvider";
import { buildPublicAppUrl } from "@/lib/publicAppUrl";

interface CleanerWithAssignments {
  user_id: string;
  name: string;
  email: string;
  setup_completed: boolean;
  status: "INVITED" | "ACTIVE";
  assignments: { id: string; listing_id: string; listing_name: string }[];
}

interface CleanerAssignmentRow {
  id: string;
  cleaner_user_id: string;
  listing_id: string;
  listings: { name?: string } | null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function AdminCleanerManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [cleaners, setCleaners] = useState<CleanerWithAssignments[]>([]);
  const [listings, setListings] = useState<{ id: string; name: string }[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [
        { data: listingData, error: listingError },
        { data: connections, error: connectionError },
        { data: assignments, error: assignmentError },
      ] = await Promise.all([
        supabase.from("listings").select("id, name").eq("host_user_id", user.id).order("name"),
        supabase.from("host_cleaners").select("cleaner_user_id, invited_email, status").eq("host_user_id", user.id).order("created_at", { ascending: true }),
        supabase
          .from("cleaner_assignments")
          .select("id, cleaner_user_id, listing_id, listings(name)")
          .eq("host_user_id", user.id),
      ]);

      if (listingError) throw listingError;
      if (connectionError) throw connectionError;
      if (assignmentError) throw assignmentError;

      setListings((listingData || []) as { id: string; name: string }[]);

      if (!connections || connections.length === 0) {
        setCleaners([]);
        return;
      }

      const cleanerIds = [...new Set(connections.map((connection) => connection.cleaner_user_id))];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, name, email, setup_completed")
        .in("user_id", cleanerIds);

      if (profileError) throw profileError;

      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

      const assignmentRows = (assignments || []) as CleanerAssignmentRow[];
      const cleanerList: CleanerWithAssignments[] = connections.map((connection) => {
        const profile = profileMap.get(connection.cleaner_user_id);
        const setupCompleted = profile?.setup_completed ?? connection.status === "ACTIVE";
        const effectiveStatus: CleanerWithAssignments["status"] = setupCompleted ? "ACTIVE" : connection.status;
        return {
          user_id: connection.cleaner_user_id,
          name: profile?.name?.trim() || "",
          email: profile?.email || connection.invited_email || "",
          setup_completed: setupCompleted,
          status: effectiveStatus,
          assignments: assignmentRows
            .filter((assignment) => assignment.cleaner_user_id === connection.cleaner_user_id)
            .map((assignment) => ({
              id: assignment.id,
              listing_id: assignment.listing_id,
              listing_name: assignment.listings?.name || "Unknown",
            })),
        };
      });

      cleanerList.sort((a, b) => a.email.localeCompare(b.email));
      setCleaners(cleanerList);
    } catch (error) {
      toast({
        title: t("Unable to load cleaners"),
        description: getErrorMessage(error, t("Please refresh and try again.")),
        variant: "destructive",
      });
    }
  }, [t, toast, user]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const submitCleanerInvite = async (rawEmail: string, clearInput: boolean) => {
    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!normalizedEmail) return;

    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: {
          type: "invite_cleaner",
          cleaner_email: normalizedEmail,
          redirect_to: buildPublicAppUrl("/complete-profile"),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: data?.reinvited ? t("Invitation resent") : data?.invited ? t("Invitation sent") : t("Cleaner linked"),
        description: data?.reinvited
          ? t("A new setup email has been sent.")
          : data?.invited
          ? t("The cleaner invitation email has been sent.")
          : t("The cleaner is now available in your cleaner list."),
      });
      if (clearInput) setInviteEmail("");
      void fetchData();
    } catch (error) {
      toast({ title: t("Error"), description: getErrorMessage(error, t("Please try again.")), variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleInviteCleaner = async () => {
    await submitCleanerInvite(inviteEmail, true);
  };

  const handleAssignListing = async (cleanerUserId: string, listingId: string) => {
    if (!user) return;
    const { error } = await supabase.from("cleaner_assignments").insert({
      cleaner_user_id: cleanerUserId,
      listing_id: listingId,
      host_user_id: user.id,
    });
    if (error) {
      toast({ title: t("Error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Listing assigned") });
      void fetchData();
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from("cleaner_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast({ title: t("Error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Assignment removed") });
      void fetchData();
    }
  };

  const handleRemoveCleaner = async (cleanerUserId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("onboard-user", {
        body: { type: "remove_cleaner", cleaner_user_id: cleanerUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: t("Cleaner removed") });
      void fetchData();
    } catch (error) {
      toast({ title: t("Error"), description: getErrorMessage(error, t("Please try again.")), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> {t("Cleaners")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder={t("Invite cleaner by email")}
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="flex-1"
          />
          <Button onClick={handleInviteCleaner} disabled={inviting || !inviteEmail.trim()} size="sm">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4 mr-1" /> {t("Invite")}</>}
          </Button>
        </div>

        {cleaners.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No cleaners added yet.")}</p>
        ) : (
          <div className="space-y-3">
            {cleaners.map((cleaner) => {
              const availableListings = listings.filter(
                (listing) => !cleaner.assignments.some((assignment) => assignment.listing_id === listing.id)
              );

              return (
                <div key={cleaner.user_id} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{cleaner.name || t("Pending cleaner")}</p>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            cleaner.status === "ACTIVE"
                              ? "bg-primary/10 text-primary"
                              : "bg-amber-500/10 text-amber-700"
                          )}
                        >
                          {cleaner.status === "ACTIVE" ? t("Active") : t("Invited")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{cleaner.email}</p>
                      {!cleaner.setup_completed && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("Invitation sent. This cleaner must finish profile setup from the email link.")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!cleaner.setup_completed && cleaner.email && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={inviting}
                          onClick={() => void submitCleanerInvite(cleaner.email, false)}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {t("Resend")}
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("Remove cleaner?")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("This will remove all listing assignments for this cleaner.")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemoveCleaner(cleaner.user_id)}>{t("Remove")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {cleaner.assignments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("No listings assigned yet.")}</p>
                    ) : (
                      cleaner.assignments.map((assignment) => (
                        <div key={assignment.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5 text-sm">
                          <div className="flex items-center gap-1.5">
                            <Home className="h-3 w-3 text-muted-foreground" />
                            <span>{assignment.listing_name}</span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveAssignment(assignment.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {availableListings.length > 0 && (
                    <Select onValueChange={(value) => handleAssignListing(cleaner.user_id, value)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={t("Assign a listing...")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableListings.map((listing) => (
                          <SelectItem key={listing.id} value={listing.id}>
                            {listing.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
