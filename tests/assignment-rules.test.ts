import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatAssignmentDays,
  resolveCleanerAssignment,
} from "../src/lib/assignmentRules.ts";
import {
  resolveCleanerAssignment as resolveEdgeCleanerAssignment,
} from "../supabase/functions/_shared/assignment-rules.ts";

const monday = "2026-07-06T11:00:00";
const saturday = "2026-07-11T11:00:00";
const sunday = "2026-07-12T11:00:00";

describe("resolveCleanerAssignment", () => {
  it("uses the assignment whose selected weekdays include the event date", () => {
    const assignments = [
      {
        cleaner_user_id: "weekday-cleaner",
        listing_id: "listing-1",
        assignment_weekdays: [1, 2, 3, 4, 5],
        created_at: "2026-07-01T00:00:00Z",
      },
      {
        cleaner_user_id: "weekend-cleaner",
        listing_id: "listing-1",
        assignment_weekdays: [0, 6],
        created_at: "2026-07-02T00:00:00Z",
      },
    ];

    assert.equal(resolveCleanerAssignment(assignments, monday)?.cleaner_user_id, "weekday-cleaner");
    assert.equal(resolveCleanerAssignment(assignments, saturday)?.cleaner_user_id, "weekend-cleaner");
    assert.equal(resolveCleanerAssignment(assignments, sunday)?.cleaner_user_id, "weekend-cleaner");
  });

  it("falls back to an unrestricted room assignment when no day rule matches", () => {
    const assignments = [
      {
        cleaner_user_id: "weekday-cleaner",
        listing_id: "listing-1",
        assignment_weekdays: [1, 2, 3, 4, 5],
        created_at: "2026-07-01T00:00:00Z",
      },
      {
        cleaner_user_id: "room-cleaner",
        listing_id: "listing-1",
        assignment_weekdays: null,
        created_at: "2026-07-02T00:00:00Z",
      },
    ];

    assert.equal(resolveCleanerAssignment(assignments, saturday)?.cleaner_user_id, "room-cleaner");
  });

  it("keeps browser and Edge Function assignment resolution in sync", () => {
    const assignments = [
      {
        cleaner_user_id: "weekday-cleaner",
        listing_id: "listing-1",
        assignment_weekdays: [1, 2, 3, 4, 5],
        created_at: "2026-07-01T00:00:00Z",
      },
      {
        cleaner_user_id: "weekend-cleaner",
        listing_id: "listing-1",
        assignment_weekdays: [0, 6],
        created_at: "2026-07-02T00:00:00Z",
      },
    ];

    assert.equal(
      resolveEdgeCleanerAssignment(assignments, sunday)?.cleaner_user_id,
      resolveCleanerAssignment(assignments, sunday)?.cleaner_user_id,
    );
  });

  it("formats selected weekdays for compact settings summaries", () => {
    assert.equal(formatAssignmentDays(null), "Every day");
    assert.equal(formatAssignmentDays([1, 2, 3, 4, 5]), "Mon-Fri");
    assert.equal(formatAssignmentDays([0, 6]), "Weekends");
    assert.equal(formatAssignmentDays([2, 4]), "Tue, Thu");
  });
});
