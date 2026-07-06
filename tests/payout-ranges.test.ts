import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPayoutRange,
  buildPreviousMonthRange,
  isFirstWeekdayOfMonth,
} from "../supabase/functions/_shared/payouts.ts";

describe("buildPayoutRange", () => {
  it("builds a weekly range ending on the scheduled date", () => {
    assert.deepEqual(buildPayoutRange("WEEKLY", "2026-07-05"), {
      startStr: "2026-06-29",
      endStr: "2026-07-05",
    });
  });

  it("builds a biweekly range ending on the scheduled date", () => {
    assert.deepEqual(buildPayoutRange("BIWEEKLY", "2026-07-05"), {
      startStr: "2026-06-22",
      endStr: "2026-07-05",
    });
  });

  it("builds a monthly range for the scheduled date's calendar month", () => {
    assert.deepEqual(buildPayoutRange("MONTHLY", "2026-07-31"), {
      startStr: "2026-07-01",
      endStr: "2026-07-31",
    });
  });

  it("falls back to weekly for unknown values", () => {
    assert.deepEqual(buildPayoutRange("CUSTOM", "2026-07-05"), {
      startStr: "2026-06-29",
      endStr: "2026-07-05",
    });
  });

  it("builds the previous calendar month for monthly scheduled runs", () => {
    assert.deepEqual(buildPreviousMonthRange("2026-08-02"), {
      startStr: "2026-07-01",
      endStr: "2026-07-31",
    });
  });

  it("identifies the first selected weekday window of a month", () => {
    assert.equal(isFirstWeekdayOfMonth("2026-08-02"), true);
    assert.equal(isFirstWeekdayOfMonth("2026-08-09"), false);
  });
});
