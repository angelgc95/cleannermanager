import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type WebhookEvent =
  | "EXCEPTION_CREATED"
  | "EXCEPTION_ESCALATED"
  | "QA_REQUIRED"
  | "QA_REJECTED"
  | "QA_APPROVED"
  | "SLA_BREACH"
  | "EVENT_CANCELLED";

type WebhookRow = {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  enabled: boolean;
  signing_secret: string | null;
  events: WebhookEvent[];
  created_at: string;
};

type DraftState = {
  name: string;
  url: string;
  enabled: boolean;
  signing_secret: string;
  events: WebhookEvent[];
};

const eventOptions: WebhookEvent[] = [
  "EXCEPTION_CREATED",
  "EXCEPTION_ESCALATED",
  "QA_REQUIRED",
  "QA_REJECTED",
  "QA_APPROVED",
  "SLA_BREACH",
  "EVENT_CANCELLED",
];

function toggleEvent(current: WebhookEvent[], event: WebhookEvent, checked: boolean) {
  if (checked) {
    return current.includes(event) ? current : [...current, event];
  }
  return current.filter((value) => value !== event);
}

export default function IntegrationsPage() {
  const { organizationId } = useAuth();

  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, DraftState>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [events, setEvents] = useState<WebhookEvent[]>(["SLA_BREACH"]);

  const load = async () => {
    if (!organizationId) return;

    const { data } = await db
      .from("v1_webhooks")
      .select("id, organization_id, name, url, enabled, signing_secret, events, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    const nextRows = (data || []) as WebhookRow[];
    setRows(nextRows);

    const nextDrafts: Record<string, DraftState> = {};
    for (const row of nextRows) {
      nextDrafts[row.id] = {
        name: row.name,
        url: row.url,
        enabled: row.enabled,
        signing_secret: row.signing_secret || "",
        events: row.events || [],
      };
    }
    setDraftsById(nextDrafts);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const createWebhook = async () => {
    if (!organizationId || !name.trim() || !url.trim()) return;

    setStatusMessage(null);
    const { error } = await db
      .from("v1_webhooks")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        url: url.trim(),
        enabled,
        signing_secret: signingSecret.trim() || null,
        events,
      });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setName("");
    setUrl("");
    setSigningSecret("");
    setEnabled(true);
    setEvents(["SLA_BREACH"]);
    setStatusMessage("Webhook created.");
    await load();
  };

  const saveWebhook = async (id: string) => {
    const draft = draftsById[id];
    if (!draft) return;

    setStatusMessage(null);
    const { error } = await db
      .from("v1_webhooks")
      .update({
        name: draft.name.trim(),
        url: draft.url.trim(),
        enabled: draft.enabled,
        signing_secret: draft.signing_secret.trim() || null,
        events: draft.events,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Webhook updated.");
    await load();
  };

  const deleteWebhook = async (id: string) => {
    setStatusMessage(null);
    const { error } = await db.from("v1_webhooks").delete().eq("id", id);
    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Webhook deleted.");
    await load();
  };

  const testWebhook = async (id: string) => {
    if (!organizationId) return;

    setStatusMessage(null);
    const { data, error } = await db.functions.invoke("dispatch-webhooks-v1", {
      body: {
        organization_id: organizationId,
        event_type: "SLA_BREACH",
        payload: {
          sample: true,
          source: "console-test",
        },
        webhook_id: id,
        test_mode: true,
        force: true,
      },
    });

    if (error || data?.error) {
      setStatusMessage(error?.message || data?.error || "Webhook test failed.");
      return;
    }

    setStatusMessage(`Webhook test sent. Delivered: ${data?.delivered_count || 0}, failed: ${data?.failed_count || 0}.`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Create Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Slack bridge" />
            </div>
            <div className="space-y-1">
              <Label>URL</Label>
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.example.com/..." />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Signing secret</Label>
            <Input value={signingSecret} onChange={(event) => setSigningSecret(event.target.value)} placeholder="Optional HMAC secret" />
          </div>

          <div className="flex items-center justify-between rounded border border-border px-3 py-2">
            <span className="text-sm">Enabled</span>
            <Switch checked={enabled} onCheckedChange={(checked) => setEnabled(!!checked)} />
          </div>

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {eventOptions.map((eventName) => (
                <label key={eventName} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={events.includes(eventName)} onCheckedChange={(checked) => setEvents(toggleEvent(events, eventName, checked === true))} />
                  <span>{eventName}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={createWebhook} disabled={!organizationId || !name.trim() || !url.trim()}>
            Create Webhook
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Webhooks</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No webhooks configured.</p>}
          {rows.map((row) => {
            const draft = draftsById[row.id];
            if (!draft) return null;

            return (
              <div key={row.id} className="space-y-3 rounded border border-border p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={draft.name} onChange={(event) => setDraftsById({ ...draftsById, [row.id]: { ...draft, name: event.target.value } })} />
                  </div>
                  <div className="space-y-1">
                    <Label>URL</Label>
                    <Input value={draft.url} onChange={(event) => setDraftsById({ ...draftsById, [row.id]: { ...draft, url: event.target.value } })} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Signing secret</Label>
                  <Input
                    value={draft.signing_secret}
                    onChange={(event) => setDraftsById({ ...draftsById, [row.id]: { ...draft, signing_secret: event.target.value } })}
                    placeholder="Optional HMAC secret"
                  />
                </div>

                <div className="flex items-center justify-between rounded border border-border px-3 py-2">
                  <span className="text-sm">Enabled</span>
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(checked) => setDraftsById({ ...draftsById, [row.id]: { ...draft, enabled: !!checked } })}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {eventOptions.map((eventName) => (
                    <label key={`${row.id}:${eventName}`} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.events.includes(eventName)}
                        onCheckedChange={(checked) => setDraftsById({
                          ...draftsById,
                          [row.id]: { ...draft, events: toggleEvent(draft.events, eventName, checked === true) },
                        })}
                      />
                      <span>{eventName}</span>
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => saveWebhook(row.id)}>Save</Button>
                  <Button variant="outline" onClick={() => testWebhook(row.id)}>Test Webhook</Button>
                  <Button variant="destructive" onClick={() => deleteWebhook(row.id)}>Delete</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
