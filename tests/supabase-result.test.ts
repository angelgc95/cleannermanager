import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requireSupabaseSuccess } from "../src/lib/supabaseResult.ts";

describe("requireSupabaseSuccess", () => {
  it("returns data when the Supabase result has no error", () => {
    const data = requireSupabaseSuccess({ data: { id: "row-1" }, error: null }, "Saving row");

    assert.deepEqual(data, { id: "row-1" });
  });

  it("throws a contextual error when Supabase returns an error", () => {
    assert.throws(
      () => requireSupabaseSuccess({ data: null, error: { message: "RLS blocked" } }, "Saving row"),
      /Saving row failed: RLS blocked/
    );
  });
});
