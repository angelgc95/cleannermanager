import { useMemo, useState, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Clock, Wrench, ShoppingCart, Plus, Check, X, Loader2, ListTodo, StickyNote, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CleaningEvent, TaskItem } from "@/types/domain";
import { useI18n } from "@/i18n/LanguageProvider";
import { useEffectiveStatuses } from "@/hooks/useEffectiveStatus";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  helper?: string;
}

interface CompletedShoppingItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
}

interface CompletedEventSummary {
  eventId: string;
  cleanerName: string;
  completedAt: string | null;
  durationMinutes: number | null;
  checksCount: number;
  photosCount: number;
  shoppingItems: CompletedShoppingItem[];
  workLogNotes: string | null;
  checklistNotes: string | null;
}

function StatCard({ title, value, icon: Icon, color, helper }: StatCardProps) {
  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardContent className="flex items-start gap-4 p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${color || "bg-primary/10"}`}>
          <Icon className={`h-5 w-5 ${color ? "text-card-foreground" : "text-primary"}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const Dashboard = forwardRef<HTMLDivElement>(function Dashboard(_props, _ref) {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const isHost = role === "host";

  // Host create task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskLabel, setTaskLabel] = useState("");
  const [taskType, setTaskType] = useState("YESNO");
  const [taskRequired, setTaskRequired] = useState(true);
  const [taskHelpText, setTaskHelpText] = useState("");
  const [taskDueDate, setTaskDueDate] = useState<Date | undefined>();
  const [taskCleanerId, setTaskCleanerId] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");
  const weekWindow = useMemo(() => {
    const currentDate = new Date();
    return {
      start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }, [today]);

  const { data: todayEvents = [] } = useQuery({
    queryKey: ["dashboard-events", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("cleaning_events")
        .select("*, listings(name)")
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", `${today}T23:59:59`)
        .order("start_at");
      return (data as CleaningEvent[]) || [];
    },
  });

  const { data: stats = { openMaintenance: 0, missingItems: 0 } } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [{ count: maintenanceCount }, { count: missingCount }] = await Promise.all([
        supabase.from("maintenance_tickets").select("*", { count: "exact", head: true }).neq("status", "DONE"),
        supabase.from("shopping_list").select("*", { count: "exact", head: true }).eq("status", "MISSING"),
      ]);
      return { openMaintenance: maintenanceCount || 0, missingItems: missingCount || 0 };
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      return (data as TaskItem[]) || [];
    },
  });

  const { data: weeklyHoursMinutes = 0 } = useQuery({
    queryKey: ["dashboard-weekly-hours", weekWindow.start, weekWindow.end, role, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("log_hours")
        .select("duration_minutes")
        .gte("date", weekWindow.start)
        .lte("date", weekWindow.end);

      query = isHost ? query.eq("host_user_id", user!.id) : query.eq("user_id", user!.id);

      const { data } = await query;
      return ((data as { duration_minutes: number | null }[] | null) || []).reduce(
        (sum, entry) => sum + Number(entry.duration_minutes || 0),
        0
      );
    },
  });

  const { data: cleaners = [] } = useQuery({
    queryKey: ["dashboard-cleaners", user?.id],
    enabled: isHost && !!user,
    queryFn: async () => {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("cleaner_user_id")
        .eq("host_user_id", user!.id);
      const ids = [...new Set((assignments || []).map((a) => a.cleaner_user_id))];
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      return (profiles || []).map((p) => ({ id: p.user_id, name: p.name }));
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user || !taskLabel.trim() || !taskCleanerId) throw new Error("Missing fields");
      const { error } = await supabase.from("tasks").insert({
        host_user_id: user.id,
        assigned_cleaner_id: taskCleanerId,
        label: taskLabel.trim(),
        type: taskType,
        required: taskRequired,
        help_text: taskHelpText.trim() || null,
        due_date: taskDueDate ? format(taskDueDate, "yyyy-MM-dd") : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-tasks"] });
      toast({ title: "Task created" });
      setShowTaskForm(false);
      setTaskLabel("");
      setTaskType("YESNO");
      setTaskRequired(true);
      setTaskHelpText("");
      setTaskDueDate(undefined);
      setTaskCleanerId("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const markDoneMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("tasks").update({ status: "DONE", completed_at: new Date().toISOString() }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-tasks"] });
      toast({ title: "Task completed!" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await supabase.from("tasks").delete().eq("id", taskId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-tasks"] });
    },
  });

  const pendingTasks = tasks.filter((t) => t.status === "TODO");
  const completedTasks = tasks.filter((t) => t.status === "DONE");
  const eventIds = useMemo(() => todayEvents.map((event) => event.id), [todayEvents]);
  const { statuses: effectiveStatuses } = useEffectiveStatuses(eventIds);

  const details = (ev: CleaningEvent) => ev.event_details_json as Record<string, any> || {};
  const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

  const getCleanerName = (id: string) => cleaners.find((c) => c.id === id)?.name || "Cleaner";

  const completedTodayEvents = useMemo(
    () =>
      todayEvents.filter(
        (ev) => effectiveStatuses[ev.id] === "COMPLETED" || ev.status === "DONE"
      ),
    [todayEvents, effectiveStatuses]
  );

  const activeTodayEvents = useMemo(
    () =>
      todayEvents.filter(
        (ev) => effectiveStatuses[ev.id] !== "COMPLETED" && ev.status !== "DONE"
      ),
    [todayEvents, effectiveStatuses]
  );

  const completedEventIds = useMemo(
    () => completedTodayEvents.map((event) => event.id),
    [completedTodayEvents]
  );

  const { data: completedEventSummaries = {} } = useQuery<Record<string, CompletedEventSummary>>({
    queryKey: ["dashboard-completed-event-summaries", completedEventIds.join(","), role],
    enabled: completedEventIds.length > 0,
    queryFn: async () => {
      const { data: runs } = await supabase
        .from("checklist_runs")
        .select("id, cleaning_event_id, cleaner_user_id, finished_at, duration_minutes, overall_notes, started_at")
        .in("cleaning_event_id", completedEventIds)
        .not("finished_at", "is", null)
        .order("started_at", { ascending: false });

      const latestRunByEvent = new Map<string, any>();
      for (const run of runs || []) {
        if (!latestRunByEvent.has(run.cleaning_event_id)) {
          latestRunByEvent.set(run.cleaning_event_id, run);
        }
      }

      const latestRuns = Array.from(latestRunByEvent.values());
      const runIds = latestRuns.map((run) => run.id);
      const cleanerIds = [...new Set(latestRuns.map((run) => run.cleaner_user_id).filter(Boolean))];

      const [profilesResult, logHoursResult, responsesResult, photosResult, shoppingResult] = await Promise.all([
        cleanerIds.length > 0
          ? supabase.from("profiles").select("user_id, name").in("user_id", cleanerIds)
          : Promise.resolve({ data: [] as any[] }),
        runIds.length > 0
          ? supabase.from("log_hours").select("checklist_run_id, duration_minutes, description").in("checklist_run_id", runIds)
          : Promise.resolve({ data: [] as any[] }),
        runIds.length > 0
          ? supabase.from("checklist_responses").select("run_id").in("run_id", runIds)
          : Promise.resolve({ data: [] as any[] }),
        runIds.length > 0
          ? supabase.from("checklist_photos").select("run_id").in("run_id", runIds)
          : Promise.resolve({ data: [] as any[] }),
        runIds.length > 0
          ? supabase.from("shopping_list").select("id, checklist_run_id, quantity_needed, note, products(name)").in("checklist_run_id", runIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const cleanerNameById = Object.fromEntries(
        ((profilesResult.data as any[]) || []).map((profile) => [profile.user_id, profile.name || "Cleaner"])
      );
      const logHoursByRunId = Object.fromEntries(
        ((logHoursResult.data as any[]) || []).map((entry) => [entry.checklist_run_id, entry])
      );

      const responseCountByRunId: Record<string, number> = {};
      for (const response of (responsesResult.data as any[]) || []) {
        responseCountByRunId[response.run_id] = (responseCountByRunId[response.run_id] || 0) + 1;
      }

      const photoCountByRunId: Record<string, number> = {};
      for (const photo of (photosResult.data as any[]) || []) {
        photoCountByRunId[photo.run_id] = (photoCountByRunId[photo.run_id] || 0) + 1;
      }

      const shoppingByRunId: Record<string, CompletedShoppingItem[]> = {};
      for (const item of (shoppingResult.data as any[]) || []) {
        if (!shoppingByRunId[item.checklist_run_id]) shoppingByRunId[item.checklist_run_id] = [];
        shoppingByRunId[item.checklist_run_id].push({
          id: item.id,
          name: item.products?.name || "Unknown",
          quantity: item.quantity_needed || 0,
          note: item.note || null,
        });
      }

      return completedTodayEvents.reduce<Record<string, CompletedEventSummary>>((acc, event) => {
        const run = latestRunByEvent.get(event.id);
        const logHours = run ? logHoursByRunId[run.id] : null;
        acc[event.id] = {
          eventId: event.id,
          cleanerName: run?.cleaner_user_id ? cleanerNameById[run.cleaner_user_id] || getCleanerName(run.cleaner_user_id) : t("Cleaner"),
          completedAt: run?.finished_at || null,
          durationMinutes: logHours?.duration_minutes ?? run?.duration_minutes ?? null,
          checksCount: run ? responseCountByRunId[run.id] || 0 : 0,
          photosCount: run ? photoCountByRunId[run.id] || 0 : 0,
          shoppingItems: run ? shoppingByRunId[run.id] || [] : [],
          workLogNotes: logHours?.description || null,
          checklistNotes: run?.overall_notes || null,
        };
        return acc;
      }, {});
    },
  });

  const dashboardSummary = useMemo(() => {
    if (todayEvents.length === 0) {
      return isHost
        ? t("No turnovers are scheduled today. Use the calendar to review upcoming work and adjust assignments.")
        : t("No cleanings are scheduled today. Check the calendar for upcoming turnovers or log extra time if needed.");
    }

    if (activeTodayEvents.length === 0) {
      return isHost
        ? t("Today's turnovers are complete. Review submissions, shopping follow-ups, and payout readiness.")
        : t("Today's cleanings are finished. You can review completed work or log any extra support hours.");
    }

    return isHost
      ? t("Track active turnovers, cleaner submissions, and unresolved operational issues from one place.")
      : t("Stay on top of your assigned cleanings, pending tasks, and any extra work that still needs to be logged.");
  }, [activeTodayEvents.length, isHost, t, todayEvents.length]);

  return (
    <div>
      <PageHeader
        title={t("Dashboard")}
        description={t("Overview of today's activity")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/calendar")}>
              {t("Open Calendar")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(isHost ? "/payouts" : "/hours")}>
              {isHost ? t("Review Payouts") : t("Log Extra Hours")}
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <Card className="overflow-hidden border-border/70 bg-card/85 shadow-sm">
          <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                {isHost ? t("Host operations") : t("Cleaner schedule")}
              </p>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {formatDate(today, "PPPP")}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{dashboardSummary}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Active now")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{activeTodayEvents.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Completed today")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{completedTodayEvents.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Pending tasks")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{pendingTasks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t("Today's Cleanings")}
            value={todayEvents.length}
            icon={CalendarDays}
            helper={activeTodayEvents.length > 0 ? t("Still in motion today") : t("Nothing overdue in today's queue")}
          />
          <StatCard
            title={t("Hours This Week")}
            value={formatMinutes(weeklyHoursMinutes)}
            icon={Clock}
            helper={t("Logged hours in the current week")}
          />
          <StatCard
            title={t("Open Maintenance")}
            value={stats.openMaintenance}
            icon={Wrench}
            helper={t("Tickets waiting on action")}
          />
          <StatCard
            title={t("Missing Items")}
            value={stats.missingItems}
            icon={ShoppingCart}
            helper={t("Supply requests still unresolved")}
          />
        </div>

        {/* Today's Cleaning Events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("Today's Cleaning Events")}</CardTitle>
          </CardHeader>
          <CardContent>
            {activeTodayEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                {completedTodayEvents.length > 0
                  ? t("All today's cleaning events are completed.")
                  : t("No cleaning events scheduled for today.")}
              </p>
            ) : (
              <div className="space-y-3">
                {activeTodayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => navigate(`/events/${ev.id}`)}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border border-border cursor-pointer transition-colors",
                      effectiveStatuses[ev.id] === "COMPLETED" || ev.status === "DONE"
                        ? "bg-muted/30 hover:bg-muted/40"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {ev.listings?.name || t("Listing")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ev.start_at ? format(new Date(ev.start_at), "HH:mm") : "—"} – {ev.end_at ? format(new Date(ev.end_at), "HH:mm") : "—"}
                        {details(ev).nights != null && ` · ${details(ev).nights} nights`}
                        {details(ev).guests != null ? ` · ${details(ev).guests} guests` : ""}
                      </p>
                    </div>
                    <StatusBadge
                      status={
                        effectiveStatuses[ev.id] === "COMPLETED"
                          ? "COMPLETED"
                          : effectiveStatuses[ev.id] || ev.status
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("Completed Today")}</CardTitle>
          </CardHeader>
          <CardContent>
            {completedTodayEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">{t("No completed cleaning events yet.")}</p>
            ) : isHost ? (
              <div className="space-y-4">
                {completedTodayEvents.map((event) => {
                  const summary = completedEventSummaries[event.id];
                  const shoppingItems = summary?.shoppingItems || [];
                  const duration = summary?.durationMinutes;
                  return (
                    <Card key={event.id} className="border-border/70">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground">
                              {event.listings?.name || t("Listing")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {event.start_at ? format(new Date(event.start_at), "HH:mm") : "—"} – {event.end_at ? format(new Date(event.end_at), "HH:mm") : "—"}
                              {details(event).nights != null && ` · ${details(event).nights} nights`}
                              {details(event).guests != null ? ` · ${details(event).guests} guests` : ""}
                            </p>
                          </div>
                          <StatusBadge status="COMPLETED" />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">{t("Submitted by")}</p>
                            <p className="font-medium flex items-center gap-1.5">
                              <User className="h-4 w-4 text-muted-foreground" />
                              {summary?.cleanerName || t("Cleaner")}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("Submitted at")}</p>
                            <p className="font-medium text-xs">
                              {summary?.completedAt ? formatDate(summary.completedAt, "MMM d, HH:mm") : t("N/A")}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("Duration")}</p>
                            <p className="font-medium">
                              {duration != null ? `${Math.floor(duration / 60)}h ${duration % 60}m` : t("N/A")}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("Checklist checks")}</p>
                            <p className="font-medium">{summary?.checksCount || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("Photos uploaded")}</p>
                            <p className="font-medium">{summary?.photosCount || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("Shopping items")}</p>
                            <p className="font-medium">{shoppingItems.length}</p>
                          </div>
                        </div>

                        {summary?.workLogNotes && (
                          <div className="flex items-start gap-1.5 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-muted-foreground">{t("Work log notes")}</p>
                              <p className="font-medium">{summary.workLogNotes}</p>
                            </div>
                          </div>
                        )}

                        {summary?.checklistNotes && (
                          <div className="flex items-start gap-1.5 text-sm">
                            <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-muted-foreground">{t("Checklist notes")}</p>
                              <p className="font-medium">{summary.checklistNotes}</p>
                            </div>
                          </div>
                        )}

                        {shoppingItems.length > 0 && (
                          <div className="text-sm">
                            <div className="flex items-center gap-1.5 mb-2">
                              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                              <p className="text-muted-foreground font-medium">{t("Shopping List")} ({shoppingItems.length})</p>
                            </div>
                            <div className="space-y-1 pl-6">
                              {shoppingItems.slice(0, 4).map((item) => (
                                <div key={item.id} className="flex items-center gap-2 text-sm">
                                  <span className="font-medium">{item.name}</span>
                                  <span className="text-muted-foreground">×{item.quantity}</span>
                                  {item.note && <span className="text-xs text-muted-foreground">— {item.note}</span>}
                                </div>
                              ))}
                              {shoppingItems.length > 4 && (
                                <p className="text-xs text-muted-foreground">+{shoppingItems.length - 4} more</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/events/${event.id}`)}>
                            {t("Open details")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">{t("Listing")}</th>
                      <th className="py-2 pr-4 font-medium">{t("Window")}</th>
                      <th className="py-2 pr-4 font-medium">{t("Completed at")}</th>
                      <th className="py-2 pr-4 font-medium">{t("Duration")}</th>
                      <th className="py-2 pr-0 font-medium">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedTodayEvents.map((event) => {
                      const summary = completedEventSummaries[event.id];
                      const duration = summary?.durationMinutes;
                      return (
                        <tr
                          key={event.id}
                          onClick={() => navigate(`/events/${event.id}`)}
                          className="border-b border-border/60 cursor-pointer hover:bg-muted/40"
                        >
                          <td className="py-3 pr-4 font-medium">{event.listings?.name || t("Listing")}</td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {event.start_at ? format(new Date(event.start_at), "HH:mm") : "—"} – {event.end_at ? format(new Date(event.end_at), "HH:mm") : "—"}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {summary?.completedAt ? formatDate(summary.completedAt, "HH:mm") : t("N/A")}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {duration != null ? `${Math.floor(duration / 60)}h ${duration % 60}m` : t("N/A")}
                          </td>
                          <td className="py-3 pr-0">
                            <StatusBadge status="COMPLETED" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ListTodo className="h-5 w-5" /> Tasks
            </CardTitle>
            {isHost && (
              <Button size="sm" variant="outline" onClick={() => setShowTaskForm(!showTaskForm)} className="gap-1">
                {showTaskForm ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> Add Task</>}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Host: Create task form */}
            {isHost && showTaskForm && (
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Label</Label>
                      <Input value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} placeholder="Task description" />
                    </div>
                    <div className="space-y-1">
                      <Label>Type</Label>
                      <Select value={taskType} onValueChange={setTaskType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="YESNO">Yes / No</SelectItem>
                          <SelectItem value="PHOTO">Photo</SelectItem>
                          <SelectItem value="TEXT">Text</SelectItem>
                          <SelectItem value="NUMBER">Number</SelectItem>
                          <SelectItem value="TIMER">Timer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Assign to</Label>
                      <Select value={taskCleanerId} onValueChange={setTaskCleanerId}>
                        <SelectTrigger><SelectValue placeholder="Select cleaner..." /></SelectTrigger>
                        <SelectContent>
                          {cleaners.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Help text <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Textarea value={taskHelpText} onChange={(e) => setTaskHelpText(e.target.value)} placeholder="Additional instructions..." rows={2} className="resize-none" />
                    </div>
                    <div className="space-y-1">
                      <Label>Due date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !taskDueDate && "text-muted-foreground")}>
                            {taskDueDate ? formatDate(taskDueDate, "PPP") : t("Pick a date")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={taskDueDate} onSelect={setTaskDueDate} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Switch checked={taskRequired} onCheckedChange={setTaskRequired} id="task-required" />
                      <Label htmlFor="task-required">Required</Label>
                    </div>
                  </div>
                  <Button onClick={() => createTaskMutation.mutate()} disabled={createTaskMutation.isPending || !taskLabel.trim() || !taskCleanerId} className="gap-1">
                    {createTaskMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Task
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Pending Tasks */}
            {pendingTasks.length === 0 && completedTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No tasks yet.</p>
            ) : (
              <>
                {pendingTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending ({pendingTasks.length})</p>
                    {pendingTasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{task.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.type} {task.required && "· Required"}
                            {task.due_date && ` · ${t("Due")} ${formatDate(task.due_date, "MMM d")}`}
                            {isHost && ` · ${getCleanerName(task.assigned_cleaner_id)}`}
                          </p>
                          {task.help_text && <p className="text-xs text-muted-foreground mt-0.5">{task.help_text}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!isHost && (
                            <Button size="sm" variant="default" onClick={() => markDoneMutation.mutate(task.id)} className="gap-1 h-8">
                              <Check className="h-3.5 w-3.5" /> Done
                            </Button>
                          )}
                          {isHost && (
                            <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => deleteTaskMutation.mutate(task.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed ({completedTasks.length})</p>
                    {completedTasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-muted-foreground line-through">{task.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {`${t("Completed")} ${task.completed_at ? formatDate(task.completed_at, "MMM d, HH:mm") : ""}`}
                            {isHost && ` · ${getCleanerName(task.assigned_cleaner_id)}`}
                          </p>
                        </div>
                        {isHost && (
                          <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => deleteTaskMutation.mutate(task.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
export default Dashboard;
