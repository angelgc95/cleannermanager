import { ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader({ title, description, actions }, ref) {
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const isHostDesktop = role === "host" && !isMobile;

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        isHostDesktop
          ? "bg-transparent px-6 pt-6 pb-2"
          : "border-b border-border bg-card px-4 py-4 sm:px-6"
      )}
    >
      <div className="min-w-0">
        <h1 className={cn("font-semibold text-foreground", isHostDesktop ? "text-3xl tracking-tight" : "text-xl")}>{title}</h1>
        {description && (
          <p className={cn("mt-0.5 text-muted-foreground", isHostDesktop ? "text-base" : "text-sm")}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 self-start sm:self-auto">{actions}</div>}
    </div>
  );
});
