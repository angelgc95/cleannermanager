import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const navigate = useNavigate();
  const { role } = useAuth();
  const isHost = role === "host";

  useEffect(() => {
    const fetchEvents = async () => {
      const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
      const { data } = await supabase
        .from("cleaning_events")
        .select("*, listings(name)")
        .gte("start_at", start.toISOString())
        .lte("start_at", end.toISOString())
        .order("start_at");
      setEvents(data || []);
    };
    fetchEvents();
  }, [currentMonth]);

  useEffect(() => {
    if (!isHost) return;
    const fetchSuggestions = async () => {
      const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
      const { data } = await supabase
        .from("pricing_suggestions")
        .select("*, listings(name)")
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"));
      setSuggestions(data || []);
    };
    fetchSuggestions();
  }, [currentMonth, isHost]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const result: Date[] = [];
    let day = start;
    while (day <= end) { result.push(day); day = addDays(day, 1); }
    return result;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
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
    const map: Record<string, any[]> = {};
    suggestions.forEach((s) => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [suggestions]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const selectedSuggestions = selectedDay ? (suggestionsByDate[selectedDay] || []) : [];

  const colorClasses: Record<string, string> = {
    green: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    orange: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/20 text-red-700 dark:text-red-400",
  };

  const details = (ev: any) => ev.event_details_json || {};

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Calendar" description="Cleaning schedule overview" actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{format(currentMonth, "MMMM yyyy")}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
        </div>
      } />
      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden bg-card">
          {weekDays.map((d) => (
            <div key={d} className="p-2 text-xs font-medium text-muted-foreground text-center border-b border-border bg-muted/30">{d}</div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate[key] || [];
            const daySuggestions = isHost ? (suggestionsByDate[key] || []) : [];
            const topSuggestion = daySuggestions.length > 0
              ? daySuggestions.reduce((a: any, b: any) => (b.uplift_pct > a.uplift_pct ? b : a))
              : null;

            return (
              <div
                key={key}
                className={cn(
                  "min-h-[100px] p-1.5 border-b border-r border-border last:border-r-0 transition-colors cursor-pointer hover:bg-muted/10",
                  !isSameMonth(day, currentMonth) && "bg-muted/20",
                  isToday(day) && "bg-primary/5"
                )}
                onClick={() => isHost && daySuggestions.length > 0 && setSelectedDay(key)}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(day) && "bg-primary text-primary-foreground font-bold", !isSameMonth(day, currentMonth) && "text-muted-foreground")}>{format(day, "d")}</span>
                  {topSuggestion && topSuggestion.uplift_pct > 0 && (
                    <span className={cn("inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", colorClasses[topSuggestion.color_level] || colorClasses.green)}>
                      +{Math.round(topSuggestion.uplift_pct)}%
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((ev: any) => {
                    const isCancelled = ev.status === "CANCELLED";
                    return (
                      <button key={ev.id} onClick={(e) => { e.stopPropagation(); navigate(`/events/${ev.id}`); }} className={cn("w-full text-left px-1.5 py-0.5 rounded text-xs truncate transition-colors", isCancelled ? "bg-muted text-muted-foreground line-through opacity-60" : ev.status === "DONE" ? "bg-[hsl(var(--status-done)/0.15)] text-[hsl(var(--status-done))]" : ev.status === "IN_PROGRESS" ? "bg-[hsl(var(--status-in-progress)/0.15)] text-[hsl(var(--status-in-progress))]" : "bg-[hsl(var(--status-todo)/0.15)] text-[hsl(var(--status-todo))]")}>
                        {ev.listings?.name || "Cleaning"}{details(ev).nights != null ? ` · ${details(ev).nights}N` : ""}{details(ev).guests != null ? ` · ${details(ev).guests}G` : ""}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && <p className="text-xs text-muted-foreground px-1">+{dayEvents.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing Suggestion Detail Sheet */}
      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Price Suggestions — {selectedDay}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {selectedSuggestions.map((s: any) => (
              <div key={s.id} className="border border-border rounded-lg p-4 space-y-3">
                {s.listings?.name && (
                  <p className="text-xs font-medium text-muted-foreground">{s.listings.name}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", colorClasses[s.color_level] || colorClasses.green)}>
                    +{Math.round(s.uplift_pct)}%
                  </span>
                  <span className="text-sm text-muted-foreground">Confidence: {Math.round(s.confidence * 100)}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Base Price</p>
                    <p className="font-semibold">€{s.base_price}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Suggested Price</p>
                    <p className="font-semibold text-primary">€{s.suggested_price}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5">Why this price:</p>
                  {s.reasons && Array.isArray(s.reasons) && s.reasons.length > 0 ? (
                    <ul className="space-y-1.5">
                      {(s.reasons as any[]).map((r: any, i: number) => (
                        <li key={i} className="text-xs flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", r.category === "bank_holiday" ? "bg-red-400" : r.category === "weekend" ? "bg-blue-400" : r.category === "festival" ? "bg-purple-400" : r.category === "sports" ? "bg-green-400" : "bg-amber-400")} />
                          <span className="font-medium capitalize">{r.category.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground">— {r.title}</span>
                          <span className="text-muted-foreground ml-auto">(+{r.contribution})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No specific events detected — based on minimum uplift setting.</p>
                  )}
                </div>
              </div>
            ))}
            {selectedSuggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">No suggestions for this date.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
