import { cn } from "@/lib/utils";

type StatusVariant = "todo" | "in_progress" | "done" | "cancelled" | "open" | "missing" | "ordered" | "bought" | "ok" | "pending" | "paid";

const variantStyles: Record<StatusVariant, string> = {
  todo: "status-todo",
  in_progress: "status-in-progress",
  done: "status-done",
  cancelled: "status-cancelled",
  open: "status-todo",
  missing: "bg-destructive/10 text-destructive",
  ordered: "status-in-progress",
  bought: "status-done",
  ok: "status-done",
  pending: "status-in-progress",
  paid: "status-done",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/-/g, "_") as StatusVariant;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[key] || "bg-muted text-muted-foreground",
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
