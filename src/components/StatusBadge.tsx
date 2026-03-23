import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/LanguageProvider";

type StatusVariant = "todo" | "in_progress" | "done" | "completed" | "cancelled" | "open" | "missing" | "ordered" | "bought" | "ok" | "pending" | "paid" | "partially_paid" | "processed";

const variantStyles: Record<StatusVariant, string> = {
  todo: "status-todo",
  in_progress: "status-in-progress",
  done: "status-done",
  completed: "status-done",
  cancelled: "status-cancelled",
  open: "status-todo",
  missing: "bg-destructive/10 text-destructive",
  ordered: "status-in-progress",
  bought: "status-done",
  ok: "status-done",
  pending: "status-in-progress",
  paid: "status-done",
  partially_paid: "bg-amber-500/10 text-amber-700",
  processed: "bg-primary/10 text-primary",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(function StatusBadge({ status, className }, ref) {
  const { tStatus } = useI18n();
  const key = status.toLowerCase().replace(/-/g, "_") as StatusVariant;
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[key] || "bg-muted text-muted-foreground",
        className
      )}
    >
      {tStatus(status)}
    </span>
  );
});
