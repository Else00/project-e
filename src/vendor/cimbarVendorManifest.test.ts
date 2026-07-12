import { describe, expect, it } from "vitest";
import { cimbarVendorManifest, vendorAssetPath } from "./cimbarVendorManifest";

describe("vendored cimbar manifest", () => {
  it("points to static GitHub Pages compatible assets and sources", () => {
    expect(cimbarVendorManifest.version).toBe("v0.6.5");
    expect(cimbarVendorManifest.files.wasm).toMatch(/\.wasm$/);
    expect(cimbarVendorManifest.licenses.map((license) => license.license)).toEqual([
      "MPL-2.0",
      "BSD-3-Clause",
    ]);
    expect(vendorAssetPath(cimbarVendorManifest.files.decoderWorker)).toBe(
      "/vendor/cimbar/v0.6.5/recv-worker.2026-05-09T0146.js",
    );
  });
});
