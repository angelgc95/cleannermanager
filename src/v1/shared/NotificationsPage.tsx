import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/v1/lib/db";
import { useAuth } from "@/hooks/useAuth";

type NotificationRow = {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  event_id: string | null;
  exception_id: string | null;
  type: "AUTOMATION" | "EXCEPTION" | "QA" | "SYSTEM";
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

interface NotificationsPageProps {
  title: string;
  eventHrefPrefix: string;
}

export default function NotificationsPage({ title, eventHrefPrefix }: NotificationsPageProps) {
  const { organizationId, user } = useAuth();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");

  const load = async () => {
    if (!user?.id) return;

    let query = db
      .from("v1_notifications")
      .select("id, organization_id, recipient_user_id, event_id, exception_id, type, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data } = await query;
    setRows((data || []) as NotificationRow[]);
  };

  useEffect(() => {
    load();
  }, [organizationId, user?.id]);

  const filteredRows = useMemo(() => {
    if (filter === "UNREAD") {
      return rows.filter((row) => !row.read_at);
    }
    return rows;
  }, [filter, rows]);

  const unreadCount = useMemo(() => rows.filter((row) => !row.read_at).length, [rows]);

  const markRead = async (id: string) => {
    setStatusMessage(null);
    const { error } = await db
      .from("v1_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    await load();
  };

  const markAllRead = async () => {
    setStatusMessage(null);

    let query = db
      .from("v1_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", user?.id || "")
      .is("read_at", null);

    if (organizationId) query = query.eq("organization_id", organizationId);

    const { error } = await query;
    if (error) {
      setStatusMessage(error.message);
      return;
    }

    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Unread: {unreadCount}</p>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="UNREAD">Unread</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredRows.length === 0 && <p className="text-sm text-muted-foreground">No notifications.</p>}
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.type} · {new Date(row.created_at).toLocaleString()}</p>
              </div>
              {row.body && <p className="mt-1 text-xs text-muted-foreground">{row.body}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {!row.read_at && <Button size="sm" variant="outline" onClick={() => markRead(row.id)}>Mark read</Button>}
                {row.event_id && (
                  <Link to={`${eventHrefPrefix}/${row.event_id}`}>
                    <Button size="sm">Open event</Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
