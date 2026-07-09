import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reassignOpenCleaningEventsForListing } from "../src/lib/assignmentBackfill.ts";

type Row = Record<string, any>;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private updatePayload: Row | null = null;
  private readonly rowsByTable: Record<string, Row[]>;
  private readonly table: string;

  constructor(rowsByTable: Record<string, Row[]>, table: string) {
    this.rowsByTable = rowsByTable;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  update(payload: Row) {
    this.updatePayload = payload;
    return this;
  }

  then(resolve: (value: { data: Row[]; error: null }) => void) {
    resolve({ data: this.apply(), error: null });
  }

  private apply() {
    const tableRows = this.rowsByTable[this.table] || [];
    const rows = tableRows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.updatePayload) {
      rows.forEach((row) => Object.assign(row, this.updatePayload));
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

describe("reassignOpenCleaningEventsForListing", () => {
  it("updates stale safe auto events from listing weekday rules only", async () => {
    const rowsByTable: Record<string, Row[]> = {
      cleaner_assignments: [
        {
          host_user_id: "host-1",
          listing_id: "listing-1",
          cleaner_user_id: "weekday-cleaner",
          assignment_weekdays: [1, 2, 3, 4, 5],
          created_at: "2026-07-01T00:00:00Z",
        },
        {
          host_user_id: "host-1",
          listing_id: "listing-1",
          cleaner_user_id: "weekend-cleaner",
          assignment_weekdays: [0, 6],
          created_at: "2026-07-02T00:00:00Z",
        },
      ],
      cleaning_events: [
        {
          id: "safe-weekday-event",
          host_user_id: "host-1",
          listing_id: "listing-1",
          source: "AUTO",
          status: "TODO",
          locked: false,
          checklist_run_id: null,
          assigned_cleaner_id: "weekend-cleaner",
          start_at: "2026-07-06T11:00:00",
        },
        {
          id: "safe-weekend-event",
          host_user_id: "host-1",
          listing_id: "listing-1",
          source: "AUTO",
          status: "TODO",
          locked: false,
          checklist_run_id: null,
          assigned_cleaner_id: "weekend-cleaner",
          start_at: "2026-07-11T11:00:00",
        },
        {
          id: "done-event",
          host_user_id: "host-1",
          listing_id: "listing-1",
          source: "AUTO",
          status: "DONE",
          locked: false,
          checklist_run_id: null,
          assigned_cleaner_id: "weekend-cleaner",
          start_at: "2026-07-07T11:00:00",
        },
        {
          id: "manual-event",
          host_user_id: "host-1",
          listing_id: "listing-1",
          source: "MANUAL",
          status: "TODO",
          locked: false,
          checklist_run_id: null,
          assigned_cleaner_id: "weekend-cleaner",
          start_at: "2026-07-08T11:00:00",
        },
      ],
    };

    const result = await reassignOpenCleaningEventsForListing({
      supabase: createFakeSupabase(rowsByTable),
      hostUserId: "host-1",
      listingId: "listing-1",
    });

    assert.equal(result.scanned, 2);
    assert.equal(result.updated, 1);
    assert.equal(rowsByTable.cleaning_events[0].assigned_cleaner_id, "weekday-cleaner");
    assert.equal(rowsByTable.cleaning_events[1].assigned_cleaner_id, "weekend-cleaner");
    assert.equal(rowsByTable.cleaning_events[2].assigned_cleaner_id, "weekend-cleaner");
    assert.equal(rowsByTable.cleaning_events[3].assigned_cleaner_id, "weekend-cleaner");
  });
});
