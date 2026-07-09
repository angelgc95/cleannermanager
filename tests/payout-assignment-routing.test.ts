import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generatePayoutsForHost } from "../supabase/functions/_shared/payouts.ts";

type Row = Record<string, any>;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private updatePayload: Row | null = null;
  private insertPayload: Row | Row[] | null = null;
  private selected = "";
  private readonly rowsByTable: Record<string, Row[]>;
  private readonly table: string;

  constructor(rowsByTable: Record<string, Row[]>, table: string) {
    this.rowsByTable = rowsByTable;
    this.table = table;
  }

  select(columns = "*") {
    this.selected = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => String(row[column]) >= String(value));
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push((row) => String(row[column]) <= String(value));
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    }
    return this;
  }

  or(expression: string) {
    const match = expression.match(/^payout_id\.is\.null,payout_id\.eq\.(.+)$/);
    if (match) {
      const payoutId = match[1];
      this.filters.push((row) => row.payout_id === null || row.payout_id === payoutId);
    }
    return this;
  }

  insert(payload: Row | Row[]) {
    this.insertPayload = payload;
    return this;
  }

  update(payload: Row) {
    this.updatePayload = payload;
    return this;
  }

  then(resolve: (value: { data: Row[]; error: null }) => void) {
    resolve({ data: this.apply(), error: null });
  }

  async single() {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }

  async maybeSingle() {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }

  private apply() {
    const tableRows = this.rowsByTable[this.table] || [];

    if (this.insertPayload) {
      const payloadRows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      const inserted = payloadRows.map((payload) => ({
        id: payload.id || `${this.table}-${tableRows.length + 1}`,
        ...payload,
      }));
      tableRows.push(...inserted);
      return inserted;
    }

    let rows = tableRows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.updatePayload) {
      rows.forEach((row) => Object.assign(row, this.updatePayload));
    }

    if (this.table === "cleaner_assignments" && this.selected.includes("listings(")) {
      return rows.map((row) => ({
        ...row,
        listings: { name: row.listing_name || "Listing" },
      }));
    }

    return rows;
  }
}

function createFakeSupabase(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      rowsByTable[table] ??= [];
      return new FakeQuery(rowsByTable, table);
    },
  };
}

describe("generatePayoutsForHost assignment routing", () => {
  it("uses weekday assignment rules for event payouts instead of stale event cleaner", async () => {
    const rowsByTable: Record<string, Row[]> = {
      host_settings: [{
        host_user_id: "host-1",
        default_hourly_rate: 20,
        payout_model: "PER_EVENT_PLUS_HOURLY",
        default_event_rate: 50,
      }],
      payout_periods: [],
      payouts: [],
      cleaner_assignments: [
        {
          id: "weekday-assignment",
          host_user_id: "host-1",
          cleaner_user_id: "weekday-cleaner",
          listing_id: "listing-1",
          assignment_weekdays: [1, 2, 3, 4, 5],
          created_at: "2026-07-01T00:00:00Z",
        },
        {
          id: "weekend-assignment",
          host_user_id: "host-1",
          cleaner_user_id: "weekend-cleaner",
          listing_id: "listing-1",
          assignment_weekdays: [0, 6],
          created_at: "2026-07-01T00:01:00Z",
        },
      ],
      cleaning_events: [{
        id: "saturday-event",
        host_user_id: "host-1",
        listing_id: "listing-1",
        assigned_cleaner_id: "weekday-cleaner",
        checklist_run_id: "weekend-run",
        status: "DONE",
        start_at: "2026-07-04T11:00:00",
        payout_id: null,
      }],
      checklist_runs: [{
        id: "weekend-run",
        host_user_id: "host-1",
        cleaner_user_id: "weekend-cleaner",
        cleaning_event_id: "saturday-event",
        duration_minutes: 90,
        finished_at: "2026-07-04T12:30:00",
        payout_id: null,
      }],
      log_hours: [],
    };

    await generatePayoutsForHost({
      supabase: createFakeSupabase(rowsByTable),
      hostUserId: "host-1",
      startStr: "2026-06-29",
      endStr: "2026-07-05",
    });

    assert.equal(rowsByTable.payouts.length, 1);
    assert.equal(rowsByTable.payouts[0].cleaner_user_id, "weekend-cleaner");
    assert.equal(rowsByTable.payouts[0].event_count, 1);
    assert.equal(rowsByTable.payouts[0].total_amount, 50);
    assert.equal(rowsByTable.cleaning_events[0].payout_id, rowsByTable.payouts[0].id);
  });
});
