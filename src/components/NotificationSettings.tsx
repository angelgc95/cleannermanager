import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";

interface Prefs {
  email_enabled: boolean;
  push_enabled: boolean;
  inapp_enabled: boolean;
  reminders_12h_enabled: boolean;
  reminders_1h_enabled: boolean;
  checklist_2pm_enabled: boolean;
  manager_cc_enabled: boolean;
}

const defaultPrefs: Prefs = {
  email_enabled: true,
  push_enabled: false,
  inapp_enabled: true,
  reminders_12h_enabled: true,
  reminders_1h_enabled: true,
  checklist_2pm_enabled: true,
  manager_cc_enabled: true,
};

export function NotificationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            email_enabled: data.email_enabled ?? true,
            push_enabled: data.push_enabled ?? false,
            inapp_enabled: data.inapp_enabled ?? true,
            reminders_12h_enabled: data.reminders_12h_enabled ?? true,
            reminders_1h_enabled: data.reminders_1h_enabled ?? true,
            checklist_2pm_enabled: data.checklist_2pm_enabled ?? true,
            manager_cc_enabled: data.manager_cc_enabled ?? true,
          });
        }
        setLoaded(true);
      });
  }, [user]);

  const updatePref = async (key: keyof Prefs, value: boolean) => {
    if (!user) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);

    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...updated }, { onConflict: "user_id" });

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    }
  };

  if (!loaded) return null;

  const toggles: { key: keyof Prefs; label: string; description: string }[] = [
    { key: "inapp_enabled", label: "In-App Notifications", description: "Show notifications in the bell icon" },
    { key: "email_enabled", label: "Email Notifications", description: "Receive email reminders" },
    { key: "reminders_12h_enabled", label: "12-Hour Reminder", description: "Get notified 12 hours before a cleaning" },
    { key: "reminders_1h_enabled", label: "1-Hour Reminder", description: "Get notified 1 hour before a cleaning" },
    { key: "checklist_2pm_enabled", label: "2 PM Checklist Reminder", description: "Remind if checklist not submitted by 2 PM" },
    { key: "manager_cc_enabled", label: "Manager CC on Overdue", description: "Also notify managers when checklists are overdue" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t.label}</Label>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
            <Switch
              checked={prefs[t.key]}
              onCheckedChange={(v) => updatePref(t.key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
