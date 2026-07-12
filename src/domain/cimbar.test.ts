import { describe, expect, it } from "vitest";
import {
  createTransferPresets,
  defaultEncodeIdBase,
  evaluateDecoderConfig,
  evaluateEncoderConfig,
  modeLabels,
  unwrapScalarResult,
  wasmModeValues,
} from "./cimbar";
import { chunkSize, encodeId, fps, redundancy, workerCount } from "./scalars";

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

function firstPreset() {
  const [preset] = createTransferPresets(1_000);
  if (!preset) {
    throw new Error("Expected at least one transfer preset.");
  }
  return preset;
}

describe("cimbar configuration model", () => {
  it("unwraps scalar constructor results deliberately", () => {
    expect(unwrapScalarResult({ kind: "ok", value: 12 })).toBe(12);
    expect(() => unwrapScalarResult({ kind: "err", reason: "bad scalar" })).toThrow("bad scalar");
  });

  it("creates stable presets and wasm mode mappings", () => {
    expect(defaultEncodeIdBase(1_000)).toBe(1);
    const presets = createTransferPresets(1_000);
    expect(presets.map((preset) => preset.id)).toEqual([
      "balanced",
      "fast",
      "robust",
      "largeCareful",
    ]);
    expect(presets[0]?.encoder.encodeIdBase).toBe(1);
    expect(modeLabels.auto).toBe("Auto");
    expect(wasmModeValues).toEqual({ "4c": 4, bu: 66, bm: 67, b: 68 });
  });

  it("reports encoder issues that need operator attention", () => {
    const issues = evaluateEncoderConfig({
      mode: "bu",
      fps: ok(fps(24)),
      redundancy: ok(redundancy(1.1)),
      chunkSize: ok(chunkSize(10 * 1024 * 1024)),
      encodeIdBase: ok(encodeId(12)),
      encodeIdStrategy: "manual",
      colorBalance: false,
      fullscreen: false,
      fullscreenMargin: false,
      wakeLock: false,
    });
    expect(issues.map((issue) => issue.id)).toEqual([
      "bu-large-chunk",
      "high-fps",
      "low-redundancy",
      "low-manual-encode-id",
      "wake-lock-off",
    ]);
    expect(evaluateEncoderConfig(firstPreset().encoder)).toEqual([]);
  });

  it("reports decoder issues for manual mode and high throughput", () => {
    const issues = evaluateDecoderConfig({
      mode: "b",
      workers: ok(workerCount(8)),
      frameRateLimit: ok(fps(30)),
      autoDetect: true,
      preferNativeFormats: true,
    });
    expect(issues.map((issue) => issue.id)).toEqual([
      "manual-mode-with-auto-detect",
      "high-worker-count",
      "decoder-high-fps",
    ]);
    expect(evaluateDecoderConfig(firstPreset().decoder)).toEqual([]);
  });
});
