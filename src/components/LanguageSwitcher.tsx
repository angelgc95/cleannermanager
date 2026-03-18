import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/LanguageProvider";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage } = useI18n();

  return (
    <div
      data-no-translate="true"
      className={cn(
        "flex items-center gap-1 rounded-full border border-border bg-background p-1",
        className
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
        <Languages className="h-4 w-4" />
      </div>
      <Button
        type="button"
        size="sm"
        variant={language === "en" ? "default" : "ghost"}
        className={cn("h-8 rounded-full px-3 text-xs", language !== "en" && "text-muted-foreground")}
        onClick={() => setLanguage("en")}
      >
        EN
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === "es" ? "default" : "ghost"}
        className={cn("h-8 rounded-full px-3 text-xs", language !== "es" && "text-muted-foreground")}
        onClick={() => setLanguage("es")}
      >
        ES
      </Button>
    </div>
  );
}
