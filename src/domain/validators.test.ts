import { describe, expect, it } from "vitest";
import { percent, unsafeByteSize } from "./scalars";
import {
  byteSizeFromFileLike,
  formatBytes,
  formatPercent,
  parseCapabilityChecks,
  parseWasmReport,
  parseWorkerMessage,
  safeFileName,
} from "./validators";

function ok<T>(
  result:
    | { readonly kind: "ok"; readonly value: T }
    | { readonly kind: "err"; readonly reason: string },
): T {
  if (result.kind === "err") {
    throw new Error(result.reason);
  }
  return result.value;
}

describe("runtime validators", () => {
  it("sanitizes local file names", () => {
    expect(safeFileName("  a/b:c\\d.txt  ")).toBe("a_b_c_d.txt");
    expect(safeFileName("   ")).toBe("unnamed.bin");
    expect(safeFileName("x".repeat(200))).toHaveLength(160);
  });

  it("parses wasm progress reports defensively", () => {
    expect(parseWasmReport([0, { progress: 0.5 }])).toEqual({
      kind: "ok",
      value: [
        { streamId: "stream-1", progress: 0 },
        { streamId: "stream-2", progress: 0.5 },
      ],
    });
    expect(parseWasmReport("bad")).toEqual({
      kind: "err",
      reason: "WASM report must be an array.",
    });
    expect(parseWasmReport(["bad"])).toEqual({
      kind: "err",
      reason: "Report item 0 is not numeric.",
    });
    expect(parseWasmReport([{}])).toEqual({ kind: "err", reason: "Report item 0 is not numeric." });
    expect(parseWasmReport([2])).toEqual({
      kind: "err",
      reason: "Report item 0: Percent must be between 0 and 1.",
    });
  });

  it("normalizes upstream worker messages", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(parseWorkerMessage(null)).toEqual({ kind: "unknown", original: null });
    expect(parseWorkerMessage({ ready: "ready!" })).toEqual({ kind: "ready" });
    expect(parseWorkerMessage({ type: "startWasm", error: "bad wasm" })).toEqual({
      kind: "error",
      message: "bad wasm",
    });
    expect(parseWorkerMessage({ nodata: true })).toEqual({ kind: "noData" });
    expect(parseWorkerMessage({ failed_extract: true })).toEqual({ kind: "failedExtract" });
    expect(parseWorkerMessage({ error: true, res: "camera failed" })).toEqual({
      kind: "error",
      message: "camera failed",
    });
    expect(parseWorkerMessage({ error: true })).toEqual({
      kind: "error",
      message: "Decoder worker error.",
    });
    expect(parseWorkerMessage({ buff: bytes, mode: 68 })).toEqual({
      kind: "decoded",
      mode: 68,
      bytes,
    });
    expect(parseWorkerMessage({ buff: bytes })).toEqual({
      kind: "unknown",
      original: { buff: bytes },
    });
  });

  it("derives capability readiness and formats technical values", () => {
    expect(
      parseCapabilityChecks([
        { id: "wasm", label: "WASM", ok: true, requiredFor: "both", detail: "ok" },
        { id: "worker", label: "Worker", ok: false, requiredFor: "decode", detail: "missing" },
        { id: "fs", label: "Save", ok: false, requiredFor: "optional", detail: "fallback" },
      ]),
    ).toEqual({ kind: "ok", value: { encodeReady: true, decodeReady: false } });
    expect(
      parseCapabilityChecks([
        { id: "wasm", label: "WASM", ok: false, requiredFor: "both", detail: "missing" },
        { id: "download", label: "Download", ok: false, requiredFor: "encode", detail: "missing" },
      ]),
    ).toEqual({ kind: "ok", value: { encodeReady: false, decodeReady: false } });
    expect(byteSizeFromFileLike({ size: 2048 })).toBe(2048);
    expect(formatBytes(unsafeByteSize(900))).toBe("900 B");
    expect(formatBytes(unsafeByteSize(2048))).toBe("2.0 KiB");
    expect(formatBytes(unsafeByteSize(2 * 1024 * 1024))).toBe("2.0 MiB");
    expect(formatPercent(ok(percent(0.556)))).toBe("56%");
  });
});
