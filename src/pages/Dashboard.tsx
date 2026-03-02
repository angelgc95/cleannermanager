import { useEffect, useState } from "react";
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
import { CalendarDays, Clock, Wrench, ShoppingCart, Plus, Check, X, Loader2, ListTodo } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${color || 'bg-primary/10'}`}>
          <Icon className={`h-5 w-5 ${color ? 'text-card-foreground' : 'text-primary'}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface TaskItem {
  id: string;
  label: string;
  type: string;
  required: boolean;
  help_text: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  assigned_cleaner_id: string;
  created_at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, hostId, role } = useAuth();
  const { toast } = useToast();
  const isHost = role === "host";
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ hoursThisWeek: 0, openMaintenance: 0, missingItems: 0 });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cleaners, setCleaners] = useState<{ id: string; name: string }[]>([]);

  // Host create task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskLabel, setTaskLabel] = useState("");
  const [taskType, setTaskType] = useState("YESNO");
  const [taskRequired, setTaskRequired] = useState(true);
  const [taskHelpText, setTaskHelpText] = useState("");
  const [taskDueDate, setTaskDueDate] = useState<Date | undefined>();
  const [taskCleanerId, setTaskCleanerId] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  const fetchTasks = async () => {
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTasks((data as TaskItem[]) || []);
  };

  useEffect(() => {
    const fetchData = async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: events } = await supabase
        .from("cleaning_events")
        .select("*, listings(name)")
        .gte("start_at", `${today}T00:00:00`)
        .lte("start_at", `${today}T23:59:59`)
        .order("start_at");

      setTodayEvents(events || []);

      const { count: maintenanceCount } = await supabase
        .from("maintenance_tickets")
        .select("*", { count: "exact", head: true })
        .neq("status", "DONE");

      const { count: missingCount } = await supabase
        .from("shopping_list")
        .select("*", { count: "exact", head: true })
        .eq("status", "MISSING");

      setStats({
        hoursThisWeek: 0,
        openMaintenance: maintenanceCount || 0,
        missingItems: missingCount || 0,
      });
    };
    fetchData();
    fetchTasks();
  }, []);

  // Fetch cleaners for host task assignment
  useEffect(() => {
    if (!isHost || !user) return;
    const fetchCleaners = async () => {
      const { data: assignments } = await supabase
        .from("cleaner_assignments")
        .select("cleaner_user_id")
        .eq("host_user_id", user.id);
      const ids = [...new Set((assignments || []).map((a) => a.cleaner_user_id))];
      if (ids.length === 0) { setCleaners([]); return; }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", ids);
      setCleaners((profiles || []).map((p) => ({ id: p.user_id, name: p.name })));
    };
    fetchCleaners();
  }, [isHost, user]);

  const handleCreateTask = async () => {
    if (!user || !taskLabel.trim() || !taskCleanerId) return;
    setCreatingTask(true);
    const { error } = await supabase.from("tasks").insert({
      host_user_id: user.id,
      assigned_cleaner_id: taskCleanerId,
      label: taskLabel.trim(),
      type: taskType,
      required: taskRequired,
      help_text: taskHelpText.trim() || null,
      due_date: taskDueDate ? format(taskDueDate, "yyyy-MM-dd") : null,
    });
    setCreatingTask(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Send in-app notification to cleaner
      await supabase.from("in_app_notifications").insert({
        user_id: taskCleanerId,
        host_user_id: user.id,
        title: "New task assigned",
        body: taskLabel.trim(),
        link: "/",
      });
      toast({ title: "Task created" });
      setShowTaskForm(false);
      setTaskLabel("");
      setTaskType("YESNO");
      setTaskRequired(true);
      setTaskHelpText("");
      setTaskDueDate(undefined);
      setTaskCleanerId("");
      fetchTasks();
    }
  };

  const handleMarkDone = async (taskId: string) => {
    const { error } = await supabase.from("tasks").update({ status: "DONE", completed_at: new Date().toISOString() }).eq("id", taskId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "DONE", completed_at: new Date().toISOString() } : t));
      toast({ title: "Task completed!" });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from("tasks").delete().eq("id", taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const pendingTasks = tasks.filter((t) => t.status === "TODO");
  const completedTasks = tasks.filter((t) => t.status === "DONE");

  const details = (ev: any) => ev.event_details_json || {};

  const getCleanerName = (id: string) => cleaners.find((c) => c.id === id)?.name || "Cleaner";

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of today's activity" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Cleanings" value={todayEvents.length} icon={CalendarDays} />
          <StatCard title="Hours This Week" value={stats.hoursThisWeek} icon={Clock} />
          <StatCard title="Open Maintenance" value={stats.openMaintenance} icon={Wrench} />
          <StatCard title="Missing Items" value={stats.missingItems} icon={ShoppingCart} />
        </div>

        {/* Today's Cleaning Events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Cleaning Events</CardTitle>
          </CardHeader>
          <CardContent>
            {todayEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No cleaning events scheduled for today.</p>
            ) : (
              <div className="space-y-3">
                {todayEvents.map((ev: any) => (
                  <div
                    key={ev.id}
                    onClick={() => navigate(`/events/${ev.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {ev.listings?.name || "Listing"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ev.start_at ? format(new Date(ev.start_at), "HH:mm") : "—"} – {ev.end_at ? format(new Date(ev.end_at), "HH:mm") : "—"}
                        {details(ev).nights != null && ` · ${details(ev).nights} nights`}
                        {details(ev).guests != null ? ` · ${details(ev).guests} guests` : ""}
                      </p>
                    </div>
                    <StatusBadge status={ev.status} />
                  </div>
                ))}
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
                            {taskDueDate ? format(taskDueDate, "PPP") : "Pick a date"}
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
                  <Button onClick={handleCreateTask} disabled={creatingTask || !taskLabel.trim() || !taskCleanerId} className="gap-1">
                    {creatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Task
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
                            {task.due_date && ` · Due ${format(new Date(task.due_date), "MMM d")}`}
                            {isHost && ` · ${getCleanerName(task.assigned_cleaner_id)}`}
                          </p>
                          {task.help_text && <p className="text-xs text-muted-foreground mt-0.5">{task.help_text}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!isHost && (
                            <Button size="sm" variant="default" onClick={() => handleMarkDone(task.id)} className="gap-1 h-8">
                              <Check className="h-3.5 w-3.5" /> Done
                            </Button>
                          )}
                          {isHost && (
                            <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => handleDeleteTask(task.id)}>
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
                            Completed {task.completed_at ? format(new Date(task.completed_at), "MMM d, HH:mm") : ""}
                            {isHost && ` · ${getCleanerName(task.assigned_cleaner_id)}`}
                          </p>
                        </div>
                        {isHost && (
                          <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => handleDeleteTask(task.id)}>
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
}
