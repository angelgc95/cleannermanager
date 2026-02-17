import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTasks = async () => {
      const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });

      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(name), rooms(name)")
        .gte("start_at", start.toISOString())
        .lte("start_at", end.toISOString())
        .order("start_at");

      setTasks(data || []);
    };
    fetchTasks();
  }, [currentMonth]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const result: Date[] = [];
    let day = start;
    while (day <= end) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    tasks.forEach((t) => {
      if (t.start_at) {
        const key = format(new Date(t.start_at), "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(t);
      }
    });
    return map;
  }, [tasks]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Calendar"
        description="Cleaning schedule overview"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
          </div>
        }
      />
      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden bg-card">
          {/* Header */}
          {weekDays.map((d) => (
            <div key={d} className="p-2 text-xs font-medium text-muted-foreground text-center border-b border-border bg-muted/30">
              {d}
            </div>
          ))}
          {/* Days */}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate[key] || [];
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[100px] p-1.5 border-b border-r border-border last:border-r-0 transition-colors",
                  !isSameMonth(day, currentMonth) && "bg-muted/20",
                  isToday(day) && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday(day) && "bg-primary text-primary-foreground font-bold",
                    !isSameMonth(day, currentMonth) && "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="mt-1 space-y-1">
                  {dayTasks.slice(0, 3).map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      className={cn(
                        "w-full text-left px-1.5 py-0.5 rounded text-xs truncate transition-colors",
                        t.status === "DONE"
                          ? "bg-[hsl(var(--status-done)/0.15)] text-[hsl(var(--status-done))]"
                          : t.status === "IN_PROGRESS"
                          ? "bg-[hsl(var(--status-in-progress)/0.15)] text-[hsl(var(--status-in-progress))]"
                          : "bg-[hsl(var(--status-todo)/0.15)] text-[hsl(var(--status-todo))]"
                      )}
                    >
                      {t.nights_to_show != null ? `${t.nights_to_show}N` : ""}{t.guests_to_show != null ? ` · ${t.guests_to_show}G` : ""}{!t.nights_to_show && !t.guests_to_show ? (t.properties?.name || "Cleaning") : ""}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="text-xs text-muted-foreground px-1">+{dayTasks.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
