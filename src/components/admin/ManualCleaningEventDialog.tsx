import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/LanguageProvider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CleaningEventStartMode = "CURRENT_BOOKING_CHECKOUT" | "UPCOMING_BOOKING_CHECKIN";

type ListingOption = {
  id: string;
  host_user_id: string;
  name: string;
  default_checkin_time: string | null;
  default_checkout_time: string | null;
  default_checklist_template_id: string | null;
};

type AssignmentRow = {
  listing_id: string;
  cleaner_user_id: string;
};

type CleanerProfile = {
  user_id: string;
  name: string | null;
  email: string | null;
};

type ManualEventFormState = {
  listingId: string;
  bookingStartDate: string;
  bookingEndDate: string;
  guests: string;
  reference: string;
  notes: string;
};

const INITIAL_FORM_STATE: ManualEventFormState = {
  listingId: "",
  bookingStartDate: "",
  bookingEndDate: "",
  guests: "",
  reference: "",
  notes: "",
};

const EMPTY_LISTINGS: ListingOption[] = [];
const EMPTY_ASSIGNMENTS: AssignmentRow[] = [];
const EMPTY_CLEANERS: CleanerProfile[] = [];

function normalizeTimeValue(timeValue: string | null | undefined, fallback: string) {
  if (!timeValue) return fallback;
  return timeValue.length === 5 ? `${timeValue}:00` : timeValue;
}

function combineDateAndTime(date: string, timeValue: string | null | undefined, fallback: string) {
  return `${date}T${normalizeTimeValue(timeValue, fallback)}`;
}

export function ManualCleaningEventDialog() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ManualEventFormState>(INITIAL_FORM_STATE);

  const isHost = role === "host";

  const { data: formData, isLoading } = useQuery({
    queryKey: ["manual-cleaning-event-form", user?.id],
    enabled: open && isHost && !!user?.id,
    queryFn: async () => {
      const [listingsResponse, settingsResponse, assignmentsResponse] = await Promise.all([
        supabase
          .from("listings")
          .select("id, host_user_id, name, default_checkin_time, default_checkout_time, default_checklist_template_id")
          .eq("host_user_id", user!.id)
          .order("name"),
        supabase
          .from("host_settings")
          .select("cleaning_event_start_mode")
          .eq("host_user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("cleaner_assignments")
          .select("listing_id, cleaner_user_id")
          .eq("host_user_id", user!.id),
      ]);

      if (listingsResponse.error) throw listingsResponse.error;
      if (settingsResponse.error) throw settingsResponse.error;
      if (assignmentsResponse.error) throw assignmentsResponse.error;

      const assignments = (assignmentsResponse.data || []) as AssignmentRow[];
      const cleanerIds = [...new Set(assignments.map((assignment) => assignment.cleaner_user_id))];

      let cleaners: CleanerProfile[] = [];
      if (cleanerIds.length > 0) {
        const profilesResponse = await supabase
          .from("profiles")
          .select("user_id, name, email")
          .in("user_id", cleanerIds);

        if (profilesResponse.error) throw profilesResponse.error;
        cleaners = (profilesResponse.data || []) as CleanerProfile[];
      }

      return {
        listings: (listingsResponse.data || []) as ListingOption[],
        assignments,
        cleaners,
        cleaningEventStartMode:
          settingsResponse.data?.cleaning_event_start_mode === "CURRENT_BOOKING_CHECKOUT"
            ? "CURRENT_BOOKING_CHECKOUT"
            : "UPCOMING_BOOKING_CHECKIN",
      };
    },
  });

  const listings = formData?.listings ?? EMPTY_LISTINGS;
  const assignments = formData?.assignments ?? EMPTY_ASSIGNMENTS;
  const cleaners = formData?.cleaners ?? EMPTY_CLEANERS;
  const cleaningEventStartMode = formData?.cleaningEventStartMode || "UPCOMING_BOOKING_CHECKIN";

  const listingsById = useMemo(
    () => new Map(listings.map((listing) => [listing.id, listing])),
    [listings],
  );

  const cleanersById = useMemo(
    () => new Map(cleaners.map((cleaner) => [cleaner.user_id, cleaner])),
    [cleaners],
  );

  const defaultAssignmentByListingId = useMemo(() => {
    const assignmentMap = new Map<string, AssignmentRow>();
    for (const assignment of assignments) {
      if (!assignmentMap.has(assignment.listing_id)) {
        assignmentMap.set(assignment.listing_id, assignment);
      }
    }
    return assignmentMap;
  }, [assignments]);

  const selectedListing = form.listingId ? listingsById.get(form.listingId) ?? null : null;
  const defaultAssignment = selectedListing ? defaultAssignmentByListingId.get(selectedListing.id) ?? null : null;
  const defaultCleaner = defaultAssignment ? cleanersById.get(defaultAssignment.cleaner_user_id) ?? null : null;

  const nights =
    form.bookingStartDate && form.bookingEndDate
      ? differenceInCalendarDays(parseISO(form.bookingEndDate), parseISO(form.bookingStartDate))
      : null;

  const generatedAnchorDate =
    cleaningEventStartMode === "CURRENT_BOOKING_CHECKOUT" ? form.bookingEndDate : form.bookingStartDate;

  const generatedWindowPreview =
    selectedListing && generatedAnchorDate
      ? `${format(parseISO(generatedAnchorDate), "PPP")} · ${normalizeTimeValue(selectedListing.default_checkout_time, "11:00:00").slice(0, 5)} - ${normalizeTimeValue(selectedListing.default_checkin_time, "15:00:00").slice(0, 5)}`
      : null;

  useEffect(() => {
    if (!open) return;
    if (form.listingId) return;
    if (listings.length === 1) {
      setForm((current) => ({ ...current, listingId: listings[0].id }));
    }
  }, [open, listings, form.listingId]);

  const resetForm = () => {
    setForm(INITIAL_FORM_STATE);
    setSaving(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user || !selectedListing) return;
    if (!form.bookingStartDate || !form.bookingEndDate) {
      toast({
        title: t("Missing dates"),
        description: t("Add both the booking check-in and check-out dates."),
        variant: "destructive",
      });
      return;
    }

    if (nights === null || nights <= 0) {
      toast({
        title: t("Invalid stay range"),
        description: t("Check-out must be after check-in to mirror iCal booking logic."),
        variant: "destructive",
      });
      return;
    }

    const guestsCount = form.guests.trim() ? Number(form.guests) : null;
    if (guestsCount !== null && (!Number.isFinite(guestsCount) || guestsCount < 0)) {
      toast({
        title: t("Invalid guest count"),
        description: t("Guest count must be zero or higher."),
        variant: "destructive",
      });
      return;
    }

    const bookingPayload = {
      listing_id: selectedListing.id,
      host_user_id: user.id,
      start_date: form.bookingStartDate,
      end_date: form.bookingEndDate,
      source_platform: "manual",
      guests_count: guestsCount,
      nights,
      checkin_at: combineDateAndTime(form.bookingStartDate, selectedListing.default_checkin_time, "15:00:00"),
      checkout_at: combineDateAndTime(form.bookingEndDate, selectedListing.default_checkout_time, "11:00:00"),
      raw_ics_payload: null,
    };

    const anchorDate =
      cleaningEventStartMode === "CURRENT_BOOKING_CHECKOUT" ? form.bookingEndDate : form.bookingStartDate;

    const eventDetailsJson = {
      nights,
      guests: guestsCount,
      reference: form.reference.trim() || null,
      schedule_anchor: cleaningEventStartMode,
      source_date: anchorDate,
      booking_start_date: form.bookingStartDate,
      booking_end_date: form.bookingEndDate,
    };

    setSaving(true);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert(bookingPayload)
      .select("id")
      .single();

    if (bookingError || !booking) {
      setSaving(false);
      toast({
        title: t("Error creating booking"),
        description: bookingError?.message || t("The manual booking could not be created."),
        variant: "destructive",
      });
      return;
    }

    const eventPayload = {
      listing_id: selectedListing.id,
      booking_id: booking.id,
      host_user_id: user.id,
      assigned_cleaner_id: defaultAssignment?.cleaner_user_id || null,
      source: "MANUAL" as const,
      status: "TODO" as const,
      start_at: combineDateAndTime(anchorDate, selectedListing.default_checkout_time, "11:00:00"),
      end_at: combineDateAndTime(anchorDate, selectedListing.default_checkin_time, "15:00:00"),
      checklist_template_id: selectedListing.default_checklist_template_id || null,
      event_details_json: eventDetailsJson,
      notes: form.notes.trim() || null,
      reference: form.reference.trim() || null,
    };

    const { data: createdEvent, error: eventError } = await supabase
      .from("cleaning_events")
      .insert(eventPayload)
      .select("id")
      .single();

    if (eventError || !createdEvent) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      setSaving(false);
      toast({
        title: t("Error creating event"),
        description: eventError?.message || t("The cleaning event could not be created."),
        variant: "destructive",
      });
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-events"] }),
    ]);

    setSaving(false);
    setOpen(false);
    resetForm();

    toast({
      title: t("Manual event created"),
      description: t("The calendar event was created using the same booking-based timing logic as iCal sync."),
    });
  };

  if (!isHost) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <CalendarPlus className="h-4 w-4" />
          {t("Create event")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Create manual cleaning event")}</DialogTitle>
          <DialogDescription>
            {t("Use booking-style dates so the cleaning window is generated with the same rules as iCal sync.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("Loading form...")}
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("Add at least one listing before creating manual calendar events.")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>{t("Listing")}</Label>
              <Select value={form.listingId} onValueChange={(value) => setForm((current) => ({ ...current, listingId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select listing")} />
                </SelectTrigger>
                <SelectContent>
                  {listings.map((listing) => (
                    <SelectItem key={listing.id} value={listing.id}>
                      {listing.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("Booking check-in")}</Label>
                <Input
                  type="date"
                  value={form.bookingStartDate}
                  onChange={(event) => setForm((current) => ({ ...current, bookingStartDate: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>{t("Booking check-out")}</Label>
                <Input
                  type="date"
                  value={form.bookingEndDate}
                  onChange={(event) => setForm((current) => ({ ...current, bookingEndDate: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("Reference")}</Label>
                <Input
                  placeholder={t("Optional booking reference")}
                  value={form.reference}
                  onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("Guests")}</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.guests}
                  onChange={(event) => setForm((current) => ({ ...current, guests: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t("Notes")}</Label>
              <Textarea
                placeholder={t("Optional instructions for the cleaner")}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="min-h-[96px]"
              />
            </div>

            {selectedListing && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{t("Generated cleaning window")}</p>
                <p className="mt-1 text-muted-foreground">
                  {generatedWindowPreview
                    ? generatedWindowPreview
                    : t("Select booking dates to preview the generated cleaning window.")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {cleaningEventStartMode === "CURRENT_BOOKING_CHECKOUT"
                    ? t("Anchored to booking check-out, following your current iCal sync setting.")
                    : t("Anchored to upcoming booking check-in, following your current iCal sync setting.")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {defaultCleaner
                    ? `${t("Default cleaner:")} ${defaultCleaner.name || defaultCleaner.email || defaultCleaner.user_id}`
                    : t("No default cleaner is assigned to this listing yet.")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedListing.default_checklist_template_id
                    ? t("The listing default checklist template will be attached automatically.")
                    : t("This listing has no default checklist template yet.")}
                </p>
                {nights !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {nights > 0
                      ? `${t("Nights:")} ${nights}`
                      : t("Check-out must be after check-in.")}
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={saving || !selectedListing}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("Creating...")}
                  </>
                ) : (
                  t("Create event")
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
