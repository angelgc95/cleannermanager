import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type TriggerType =
  | "EVENT_CREATED"
  | "EVENT_STARTING_SOON"
  | "EVENT_OVERDUE_START"
  | "CHECKLIST_SUBMITTED"
  | "CHECKLIST_FAILED"
  | "SUPPLIES_LOW"
  | "BOOKING_CANCELLED";

type BulkMode = "CLONE" | "SCOPE_EXISTING";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  scope_unit_id: string | null;
  conditions: unknown;
  actions: unknown;
  created_at: string;
};

type RuleRun = {
  id: string;
  rule_id: string;
  event_id: string | null;
  run_id: string | null;
  status: "SUCCESS" | "FAILED";
  error: string | null;
  executed_at: string;
};

type Unit = { id: string; name: string; type: string };

type RuleDraft = {
  name: string;
  trigger_type: TriggerType;
  scope_unit_id: string | null;
  enabled: boolean;
  conditionsText: string;
  actionsText: string;
};

type BulkResult = {
  dry_run: boolean;
  batch_id: string | null;
  summary: {
    rules_total: number;
    rules_updated: number;
    rules_skipped: number;
  };
  preview: Array<{
    source_rule_id: string;
    source_rule_name: string;
    action: "ASSIGNED" | "SKIPPED";
    notes: string;
  }>;
};

const triggers: TriggerType[] = [
  "EVENT_CREATED",
  "EVENT_STARTING_SOON",
  "EVENT_OVERDUE_START",
  "CHECKLIST_SUBMITTED",
  "CHECKLIST_FAILED",
  "SUPPLIES_LOW",
  "BOOKING_CANCELLED",
];

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function AutomationsPage() {
  const { organizationId } = useAuth();

  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleRuns, setRuleRuns] = useState<RuleRun[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, RuleDraft>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("CHECKLIST_FAILED");
  const [scopeUnitId, setScopeUnitId] = useState<string | null>(null);
  const [conditionsText, setConditionsText] = useState('{\n  "checklist": {\n    "has_fail": true\n  }\n}');
  const [actionsText, setActionsText] = useState('[\n  {\n    "type": "create_exception",\n    "exception_type": "CHECKLIST_FAILED",\n    "severity": "HIGH"\n  }\n]');

  const [bulkMode, setBulkMode] = useState<BulkMode>("CLONE");
  const [bulkTargetUnitId, setBulkTargetUnitId] = useState<string | null>(null);
  const [bulkDryRun, setBulkDryRun] = useState(true);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);

  const unitLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const unit of units) {
      map[unit.id] = `${unit.name} (${unit.type})`;
    }
    return map;
  }, [units]);

  const load = async () => {
    if (!organizationId) return;

    const [{ data: ruleRows }, { data: runRows }, { data: unitRows }] = await Promise.all([
      db
        .from("v1_rules")
        .select("id, name, enabled, trigger_type, scope_unit_id, conditions, actions, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      db
        .from("v1_rule_runs")
        .select("id, rule_id, event_id, run_id, status, error, executed_at")
        .eq("organization_id", organizationId)
        .order("executed_at", { ascending: false })
        .limit(20),
      db
        .from("v1_org_units")
        .select("id, name, type")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true }),
    ]);

    const nextRules = (ruleRows || []) as Rule[];
    setRules(nextRules);
    setRuleRuns((runRows || []) as RuleRun[]);
    setUnits((unitRows || []) as Unit[]);
    setSelectedRuleIds((current) => current.filter((ruleId) => nextRules.some((rule) => rule.id === ruleId)));

    const nextDrafts: Record<string, RuleDraft> = {};
    for (const rule of nextRules) {
      nextDrafts[rule.id] = {
        name: rule.name,
        trigger_type: rule.trigger_type,
        scope_unit_id: rule.scope_unit_id,
        enabled: rule.enabled,
        conditionsText: formatJson(rule.conditions),
        actionsText: formatJson(rule.actions),
      };
    }
    setDraftsById(nextDrafts);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const toggleSelectedRule = (ruleId: string, checked: boolean) => {
    setSelectedRuleIds((current) => {
      if (checked) {
        return current.includes(ruleId) ? current : [...current, ruleId];
      }
      return current.filter((value) => value !== ruleId);
    });
  };

  const createRule = async () => {
    if (!organizationId || !name.trim()) return;

    setStatusMessage(null);

    let conditions: unknown;
    let actions: unknown;

    try {
      conditions = JSON.parse(conditionsText || "{}");
      actions = JSON.parse(actionsText || "[]");
      if (!Array.isArray(actions)) throw new Error("actions must be an array");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Invalid JSON");
      return;
    }

    const { error } = await db
      .from("v1_rules")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        enabled: true,
        trigger_type: triggerType,
        scope_unit_id: scopeUnitId,
        conditions,
        actions,
      });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setName("");
    setScopeUnitId(null);
    setStatusMessage("Rule created.");
    await load();
  };

  const saveRule = async (ruleId: string) => {
    const draft = draftsById[ruleId];
    if (!draft) return;

    setStatusMessage(null);

    let parsedConditions: unknown;
    let parsedActions: unknown;

    try {
      parsedConditions = JSON.parse(draft.conditionsText || "{}");
      parsedActions = JSON.parse(draft.actionsText || "[]");
      if (!Array.isArray(parsedActions)) throw new Error("actions must be an array");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Invalid JSON");
      return;
    }

    const { error } = await db
      .from("v1_rules")
      .update({
        name: draft.name,
        enabled: draft.enabled,
        trigger_type: draft.trigger_type,
        scope_unit_id: draft.scope_unit_id,
        conditions: parsedConditions,
        actions: parsedActions,
      })
      .eq("id", ruleId);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Rule updated.");
    await load();
  };

  const removeRule = async (ruleId: string) => {
    const { error } = await db.from("v1_rules").delete().eq("id", ruleId);
    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setStatusMessage("Rule deleted.");
    await load();
  };

  const runBulkAction = async () => {
    if (!organizationId || !bulkTargetUnitId || selectedRuleIds.length === 0) return;

    setBulkSubmitting(true);
    setStatusMessage(null);

    const { data, error } = await db.functions.invoke("bulk-apply-rules-v1", {
      body: {
        organization_id: organizationId,
        source_rule_ids: selectedRuleIds,
        target_unit_id: bulkTargetUnitId,
        mode: bulkMode,
        dry_run: bulkDryRun,
      },
    });

    setBulkSubmitting(false);

    if (error || data?.error) {
      setStatusMessage(error?.message || data?.error || "Bulk rule action failed.");
      return;
    }

    setBulkResult(data as BulkResult);
    setStatusMessage(bulkDryRun ? "Bulk rule dry run complete." : "Bulk rule action completed.");
    if (!bulkDryRun) {
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="QA reject escalations" />
            </div>

            <div className="space-y-1">
              <Label>Trigger</Label>
              <Select value={triggerType} onValueChange={(value) => setTriggerType(value as TriggerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggers.map((trigger) => (
                    <SelectItem key={trigger} value={trigger}>{trigger}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Scope Unit (optional)</Label>
              <Select value={scopeUnitId || "__org"} onValueChange={(value) => setScopeUnitId(value === "__org" ? null : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Organization-wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__org">Organization-wide</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Conditions JSON</Label>
            <Textarea value={conditionsText} onChange={(event) => setConditionsText(event.target.value)} rows={8} className="font-mono text-xs" />
          </div>

          <div className="space-y-1">
            <Label>Actions JSON (array)</Label>
            <Textarea value={actionsText} onChange={(event) => setActionsText(event.target.value)} rows={8} className="font-mono text-xs" />
          </div>

          <Button onClick={createRule} disabled={!organizationId || !name.trim()}>Create Rule</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Manage Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={bulkMode} onValueChange={(value) => setBulkMode(value as BulkMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLONE">CLONE</SelectItem>
                  <SelectItem value="SCOPE_EXISTING">SCOPE_EXISTING</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Target Unit</Label>
              <Select value={bulkTargetUnitId || ""} onValueChange={setBulkTargetUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2 text-sm">
            <span>Dry run</span>
            <Checkbox checked={bulkDryRun} onCheckedChange={(value) => setBulkDryRun(value === true)} />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Rules</Label>
              <Badge variant="secondary">{selectedRuleIds.length} selected</Badge>
            </div>
            <div className="max-h-56 space-y-2 overflow-auto rounded border border-border p-3">
              {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules available.</p>}
              {rules.map((rule) => (
                <label key={rule.id} className="flex items-center gap-3 text-sm">
                  <Checkbox checked={selectedRuleIds.includes(rule.id)} onCheckedChange={(value) => toggleSelectedRule(rule.id, value === true)} />
                  <span className="truncate">
                    {rule.name} · {rule.scope_unit_id ? (unitLabelMap[rule.scope_unit_id] || rule.scope_unit_id) : "Organization-wide"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={runBulkAction} disabled={!bulkTargetUnitId || selectedRuleIds.length === 0 || bulkSubmitting}>
            {bulkSubmitting ? "Running..." : bulkDryRun ? "Run Dry Run" : "Apply Bulk Rule Action"}
          </Button>

          {bulkResult && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={bulkResult.dry_run ? "outline" : "default"}>
                  {bulkResult.dry_run ? "Dry Run" : "Applied"}
                </Badge>
                {bulkResult.batch_id && <Badge variant="secondary">Batch Logged</Badge>}
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>Rules selected: <span className="font-medium">{bulkResult.summary.rules_total}</span></div>
                <div>Rules changed: <span className="font-medium">{bulkResult.summary.rules_updated}</span></div>
                <div>Rules skipped: <span className="font-medium">{bulkResult.summary.rules_skipped}</span></div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkResult.preview.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">No rules affected.</TableCell>
                    </TableRow>
                  )}
                  {bulkResult.preview.map((row) => (
                    <TableRow key={`${row.source_rule_id}:${row.action}`}>
                      <TableCell>{row.source_rule_name}</TableCell>
                      <TableCell>{row.action}</TableCell>
                      <TableCell className="text-muted-foreground">{row.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules configured.</p>}
          {rules.map((rule) => {
            const draft = draftsById[rule.id];
            if (!draft) return null;

            return (
              <div key={rule.id} className="space-y-3 rounded border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox checked={selectedRuleIds.includes(rule.id)} onCheckedChange={(value) => toggleSelectedRule(rule.id, value === true)} />
                    <span>Include in bulk</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Scope: {draft.scope_unit_id ? (unitLabelMap[draft.scope_unit_id] || draft.scope_unit_id) : "Organization-wide"}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={draft.name}
                      onChange={(event) => setDraftsById({
                        ...draftsById,
                        [rule.id]: { ...draft, name: event.target.value },
                      })}
                    />
                  </div>

                  <div className="flex items-end justify-between gap-3 rounded border border-border px-3 py-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Enabled</p>
                      <p className="text-sm">{draft.enabled ? "Yes" : "No"}</p>
                    </div>
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(value) => setDraftsById({
                        ...draftsById,
                        [rule.id]: { ...draft, enabled: !!value },
                      })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Trigger</Label>
                    <Select
                      value={draft.trigger_type}
                      onValueChange={(value) => setDraftsById({
                        ...draftsById,
                        [rule.id]: { ...draft, trigger_type: value as TriggerType },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {triggers.map((trigger) => (
                          <SelectItem key={trigger} value={trigger}>{trigger}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label>Scope Unit</Label>
                    <Select
                      value={draft.scope_unit_id || "__org"}
                      onValueChange={(value) => setDraftsById({
                        ...draftsById,
                        [rule.id]: { ...draft, scope_unit_id: value === "__org" ? null : value },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__org">Organization-wide</SelectItem>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>{unit.name} ({unit.type})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Conditions JSON</Label>
                  <Textarea
                    value={draft.conditionsText}
                    onChange={(event) => setDraftsById({
                      ...draftsById,
                      [rule.id]: { ...draft, conditionsText: event.target.value },
                    })}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Actions JSON</Label>
                  <Textarea
                    value={draft.actionsText}
                    onChange={(event) => setDraftsById({
                      ...draftsById,
                      [rule.id]: { ...draft, actionsText: event.target.value },
                    })}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => saveRule(rule.id)}>Save</Button>
                  <Button variant="destructive" onClick={() => removeRule(rule.id)}>Delete</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Rule Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ruleRuns.length === 0 && <p className="text-sm text-muted-foreground">No executions yet.</p>}
          {ruleRuns.map((run) => {
            const ruleName = rules.find((rule) => rule.id === run.rule_id)?.name || run.rule_id;
            return (
              <div key={run.id} className="rounded border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{ruleName}</p>
                  <p className="text-xs text-muted-foreground">{run.status}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(run.executed_at).toLocaleString()} · Event {run.event_id || "n/a"} · Run {run.run_id || "n/a"}
                </p>
                {run.error && <p className="mt-1 text-xs text-red-600">{run.error}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
