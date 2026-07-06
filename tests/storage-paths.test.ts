import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMaintenancePhotoPath } from "../src/lib/storagePaths.ts";

describe("buildMaintenancePhotoPath", () => {
  it("stores maintenance photos under the authenticated user's folder", () => {
    const path = buildMaintenancePhotoPath("user-123", "broken sink.JPG", "photo-id");

    assert.equal(path, "user-123/maintenance/photo-id.jpg");
  });

  it("uses a safe fallback extension when the file name has no extension", () => {
    const path = buildMaintenancePhotoPath("user-123", "image", "photo-id");

    assert.equal(path, "user-123/maintenance/photo-id.jpg");
  });
});
