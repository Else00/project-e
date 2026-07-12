import { describe, expect, it } from "vitest";
import { programVersion, protocolVersions } from "./protocolVersions";

describe("protocol versions", () => {
  it("keeps program and wire-format versions explicit", () => {
    expect(programVersion).toBe("0.2.1");
    expect(protocolVersions).toEqual({
      package: "0.2.0",
      wire: "1.0",
      direct: true,
      bigfile: true,
      integrity: "BLAKE3-256",
      cimbarRuntime: "libcimbar-v0.6.5",
    });
  });
});
