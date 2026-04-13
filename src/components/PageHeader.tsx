import { ReactNode, forwardRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isNativeCleanerApp } from "@/lib/appVariant";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader({ title, description, actions }, ref) {
  const { role } = useAuth();
  const eyebrow = isNativeCleanerApp()
    ? "Cleaner Suite"
    : role === "host"
      ? "Host Suite"
      : role === "cleaner"
        ? "Cleaner Suite"
        : "Operations";

  return (
    <div
      ref={ref}
      className="relative overflow-hidden border-b border-border bg-card/90 px-4 py-4 backdrop-blur sm:px-6"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            {eyebrow}
          </span>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 self-start sm:self-auto">{actions}</div>}
      </div>
    </div>
  );
});
