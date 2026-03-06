import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type LogRow = {
  id: string;
  organization_id: string | null;
  source: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  context: Record<string, unknown>;
  created_at: string;
};

export default function SystemPage() {
  const { organizationId } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);

  const load = async () => {
    let query = db
      .from("v1_system_logs")
      .select("id, organization_id, source, level, message, context, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (organizationId) {
      query = query.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
    }

    const { data } = await query;
    setRows((data || []) as LogRow[]);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No system logs yet.</p>}
          {rows.map((row) => (
            <div key={row.id} className="rounded border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{row.source}</p>
                <p className="text-xs text-muted-foreground">{row.level} · {new Date(row.created_at).toLocaleString()}</p>
              </div>
              <p className="mt-1">{row.message}</p>
              <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
                {JSON.stringify(row.context || {}, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
