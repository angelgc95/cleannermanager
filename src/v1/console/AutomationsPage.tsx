import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AutomationsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Automation engine is intentionally deferred in Foundation V1.</p>
        <p>This screen reserves the module surface for future scheduling and rule orchestration.</p>
      </CardContent>
    </Card>
  );
}
