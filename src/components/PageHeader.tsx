import { ReactNode, forwardRef } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader({ title, description, actions }, ref) {
  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 border-b border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 self-start sm:self-auto">{actions}</div>}
    </div>
  );
});
