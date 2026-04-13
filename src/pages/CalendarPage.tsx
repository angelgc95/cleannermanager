import { useState, useMemo, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import type { CleaningEvent, PricingSuggestion } from "@/types/domain";
import { useI18n } from "@/i18n/LanguageProvider";
import { useEffectiveStatuses } from "@/hooks/useEffectiveStatus";
import { ManualCleaningEventDialog } from "@/components/admin/ManualCleaningEventDialog";
import type { Json } from "@/integrations/supabase/types";

type EventDetails = {
  nights?: number | null;
  guests?: number | null;
};

type SuggestionReason = {
  category: string;
  title: string;
  contribution: number | string;
};

function isSuggestionReason(value: Json): value is SuggestionReason {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.category === "string" && typeof value.title === "string";
}

const CalendarPage = forwardRef<HTMLDivElement>(function CalendarPage(_props, _ref) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const navigate = useNavigate();
  const { role } = useAuth();
  const { formatDate, t } = useI18n();
  const isHost = role === "host";

  const monthKey = format(currentMonth, "yyyy-MM");

  const { data: events = [] } = useQuery({
    queryKey: ["calendar-events", monthKey],
    queryFn: async () => {
      const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
      const { data } = await supabase
        .from("cleaning_events")
        .select("*, listings(name)")
        .gte("start_at", start.toISOString())
        .lte("start_at", end.toISOString())
        .order("start_at");
      return (data as CleaningEvent[]) || [];
    },
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ["pricing-suggestions", monthKey],
    enabled: isHost,
    queryFn: async () => {
      const { data: settings } = await supabase
        .from("host_settings")
        .select("nightly_price_suggestions_enabled")
        .single();
      if (!settings?.nightly_price_suggestions_enabled) return [];
      const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
      const { data } = await supabase
        .from("pricing_suggestions")
        .select("*, listings(name)")
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"));
      return (data as PricingSuggestion[]) || [];
    },
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const result: Date[] = [];
    let day = start;
    while (day <= end) { result.push(day); day = addDays(day, 1); }
    return result;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CleaningEvent[]> = {};
    events.forEach((ev) => {
      if (ev.start_at) {
        const key = format(new Date(ev.start_at), "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(ev);
      }
    });
    return map;
  }, [events]);

  const suggestionsByDate = useMemo(() => {
    const map: Record<string, PricingSuggestion[]> = {};
    suggestions.forEach((s) => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [suggestions]);
  const eventIds = useMemo(() => events.map((event) => event.id), [events]);
  const { statuses: effectiveStatuses } = useEffectiveStatuses(eventIds);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const selectedSuggestions = selectedDay ? (suggestionsByDate[selectedDay] || []) : [];

  const colorClasses: Record<string, string> = {
    green: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    orange: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/20 text-red-700 dark:text-red-400",
  };

  const details = (ev: CleaningEvent): EventDetails => (ev.event_details_json as EventDetails | null) || {};

  const reasonsForSuggestion = (suggestion: PricingSuggestion): SuggestionReason[] => {
    if (!Array.isArray(suggestion.reasons)) return [];
    return suggestion.reasons.filter(isSuggestionReason);
  };

  const calendarSummary = useMemo(() => {
    const completed = events.filter((event) => {
      const status = effectiveStatuses[event.id] || event.status;
      return status === "COMPLETED" || event.status === "DONE";
    }).length;
    const inProgress = events.filter((event) => (effectiveStatuses[event.id] || event.status) === "IN_PROGRESS").length;
    const suggestionDays = Object.keys(suggestionsByDate).length;

    return {
      total: events.length,
      completed,
      inProgress,
      suggestionDays,
    };
  }, [effectiveStatuses, events, suggestionsByDate]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t("Calendar")} description={t("Cleaning schedule overview")} actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{formatDate(currentMonth, "MMMM yyyy")}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>{t("Today")}</Button>
          {isHost && <ManualCleaningEventDialog />}
        </div>
      } />
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Scheduled in view")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{calendarSummary.total}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Completed")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{calendarSummary.completed}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("In progress")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{calendarSummary.inProgress}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Price-lift days")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{calendarSummary.suggestionDays}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 text-xs text-muted-foreground shadow-sm">
            <span className="font-medium text-foreground">{t("Legend")}</span>
            <span className="inline-flex items-center rounded-full bg-[hsl(var(--status-todo)/0.15)] px-2 py-1 text-[hsl(var(--status-todo))]">{t("Upcoming")}</span>
            <span className="inline-flex items-center rounded-full bg-[hsl(var(--status-in-progress)/0.15)] px-2 py-1 text-[hsl(var(--status-in-progress))]">{t("In progress")}</span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-muted-foreground">{t("Completed")}</span>
            {isHost && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-700 dark:text-emerald-400">
                {t("Price suggestion available")}
              </span>
            )}
          </div>

          <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            {weekDays.map((d) => (
              <div key={d} className="border-b border-border bg-muted/30 p-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDate[key] || [];
              const daySuggestions = isHost ? (suggestionsByDate[key] || []) : [];
              const topSuggestion = daySuggestions.length > 0
                ? daySuggestions.reduce((a, b) => (b.uplift_pct > a.uplift_pct ? b : a))
                : null;

              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[100px] cursor-pointer border-b border-r border-border p-1.5 transition-colors hover:bg-muted/10 last:border-r-0",
                    !isSameMonth(day, currentMonth) && "bg-muted/20",
                    isToday(day) && "bg-primary/5"
                  )}
                  onClick={() => isHost && daySuggestions.length > 0 && setSelectedDay(key)}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(day) && "bg-primary font-bold text-primary-foreground", !isSameMonth(day, currentMonth) && "text-muted-foreground")}>
                      {format(day, "d")}
                    </span>
                    {topSuggestion && topSuggestion.uplift_pct > 0 && (
                      <span className={cn("inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", colorClasses[topSuggestion.color_level] || colorClasses.green)}>
                        +{Math.round(topSuggestion.uplift_pct)}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const isCancelled = ev.status === "CANCELLED";
                      const displayStatus = effectiveStatuses[ev.id] || ev.status;
                      const isCompleted = displayStatus === "COMPLETED" || ev.status === "DONE";
                      return (
                        <button key={ev.id} onClick={(e) => { e.stopPropagation(); navigate(`/events/${ev.id}`); }} className={cn("w-full truncate rounded px-1.5 py-0.5 text-left text-xs transition-colors", isCancelled ? "bg-muted text-muted-foreground line-through opacity-60" : isCompleted ? "bg-muted text-muted-foreground opacity-75" : displayStatus === "IN_PROGRESS" ? "bg-[hsl(var(--status-in-progress)/0.15)] text-[hsl(var(--status-in-progress))]" : "bg-[hsl(var(--status-todo)/0.15)] text-[hsl(var(--status-todo))]")}>
                          {ev.listings?.name || t("Cleaning")}{details(ev).nights != null ? ` · ${details(ev).nights}N` : ""}{details(ev).guests != null ? ` · ${details(ev).guests}G` : ""}
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && <p className="px-1 text-xs text-muted-foreground">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pricing Suggestion Detail Sheet */}
      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{`${t("Price Suggestions -")} ${selectedDay ? formatDate(selectedDay, "PPP") : ""}`}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {selectedSuggestions.map((s) => {
              const reasons = reasonsForSuggestion(s);

              return (
                <div key={s.id} className="border border-border rounded-lg p-4 space-y-3">
                  {s.listings?.name && (
                    <p className="text-xs font-medium text-muted-foreground">{s.listings.name}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", colorClasses[s.color_level] || colorClasses.green)}>
                      +{Math.round(s.uplift_pct)}%
                    </span>
                    <span className="text-sm text-muted-foreground">{`${t("Confidence:")} ${Math.round(s.confidence * 100)}%`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t("Base Price")}</p>
                      <p className="font-semibold">€{s.base_price}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("Suggested Price")}</p>
                      <p className="font-semibold text-primary">€{s.suggested_price}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1.5">{t("Why this price:")}</p>
                    {reasons.length > 0 ? (
                      <ul className="space-y-1.5">
                        {reasons.map((r, i) => (
                          <li key={i} className="text-xs flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", r.category === "bank_holiday" ? "bg-red-400" : r.category === "weekend" ? "bg-blue-400" : r.category === "festival" ? "bg-purple-400" : r.category === "sports" ? "bg-green-400" : "bg-amber-400")} />
                            <span className="font-medium capitalize">{r.category.replace(/_/g, " ")}</span>
                            <span className="text-muted-foreground">— {r.title}</span>
                            <span className="text-muted-foreground ml-auto">(+{r.contribution})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">{t("No specific events detected - based on minimum uplift setting.")}</p>
                    )}
                  </div>
                </div>
              );
            })}
            {selectedSuggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No suggestions for this date.")}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
});
export default CalendarPage;
