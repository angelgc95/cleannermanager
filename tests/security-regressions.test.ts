import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("security regressions", () => {
  it("does not let host user JWTs dispatch global notification jobs", () => {
    const source = readFileSync("supabase/functions/dispatch-notifications/index.ts", "utf8");

    assert.equal(source.includes("auth.getUser()"), false);
    assert.equal(source.includes("has_role"), false);
    assert.equal(source.includes("x-cron-secret"), true);
  });

  it("does not expose pending host invite status through check_email", () => {
    const source = readFileSync("supabase/functions/manage-host-access/index.ts", "utf8");
    const checkEmailBranch = source.slice(
      source.indexOf('if (action === "check_email")'),
      source.indexOf("const authHeader = req.headers.get"),
    );

    assert.equal(checkEmailBranch.includes("host_signup_invites"), false);
    assert.equal(checkEmailBranch.includes("authorized: true"), true);
  });

  it("disables Android app data backup", () => {
    const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");

    assert.equal(manifest.includes('android:allowBackup="false"'), true);
  });
});
