import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock } from "lucide-react";

interface WorkLogSectionProps {
  workStart: string;
  workEnd: string;
  workNotes: string;
  onWorkStartChange: (value: string) => void;
  onWorkEndChange: (value: string) => void;
  onWorkNotesChange: (value: string) => void;
  error?: string | null;
}

export function WorkLogSection({
  workStart,
  workEnd,
  workNotes,
  onWorkStartChange,
  onWorkEndChange,
  onWorkNotesChange,
  error,
}: WorkLogSectionProps) {
  return (
    <div className="border-b border-border bg-card px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock className="h-4 w-4 text-primary" />
        Work Log
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="work-start" className="text-xs">
            Check-In Time <span className="text-destructive">*</span>
          </Label>
          <Input
            id="work-start"
            type="time"
            value={workStart}
            onChange={(e) => onWorkStartChange(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="work-end" className="text-xs">
            Check-Out Time <span className="text-destructive">*</span>
          </Label>
          <Input
            id="work-end"
            type="time"
            value={workEnd}
            onChange={(e) => onWorkEndChange(e.target.value)}
            className="h-9"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="work-notes" className="text-xs">
          Notes (optional)
        </Label>
        <Textarea
          id="work-notes"
          value={workNotes}
          onChange={(e) => onWorkNotesChange(e.target.value)}
          placeholder="Any notes about the work..."
          className="min-h-[60px] text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
