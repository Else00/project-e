import { describe, expect, it } from "vitest";
import { createTransferPresets } from "../../domain/cimbar";
import { calculateOpticalDisplaySize, createTestEncoderAdapter } from "./encoderAdapter";

function firstPreset() {
  const [preset] = createTransferPresets(1_000);
  if (!preset) {
    throw new Error("Expected at least one transfer preset.");
  }
  return preset;
}

describe("test encoder adapter", () => {
  it("keeps fullscreen optical scaling on integral canvas multiples", () => {
    expect(calculateOpticalDisplaySize(1024, 1024, 1920, 1080, false)).toEqual({
      height: 1024,
      scale: 1,
      width: 1024,
    });
    expect(calculateOpticalDisplaySize(1024, 1024, 3840, 2160, true)).toEqual({
      height: 2048,
      scale: 2,
      width: 2048,
    });
    expect(calculateOpticalDisplaySize(1024, 720, 3840, 2160, false)).toEqual({
      height: 2160,
      scale: 3,
      width: 3072,
    });
  });

  it("fits viewports smaller than the native optical frame", () => {
    expect(calculateOpticalDisplaySize(1024, 1024, 800, 600, false)).toEqual({
      height: 600,
      scale: 600 / 1024,
      width: 600,
    });
    expect(calculateOpticalDisplaySize(0, 1024, 800, 600, false)).toEqual({
      height: 1,
      scale: 1,
      width: 1,
    });
  });

  it("gates encoding on wasm support", async () => {
    const adapter = createTestEncoderAdapter(false);
    const file = new File(["abc"], "a.bin");
    expect(await adapter.load()).toEqual({
      kind: "unavailable",
      reason: "WebAssembly is not supported.",
    });
    expect(await adapter.encode({ file, config: firstPreset().encoder })).toEqual({
      kind: "unavailable",
      reason: "WebAssembly is not supported.",
    });
  });

  it("renders predictable preview frames in jsdom", async () => {
    const adapter = createTestEncoderAdapter(true);
    const file = new File(["a".repeat(5000)], "a.bin");
    expect(await adapter.load()).toEqual({ kind: "ready" });
    expect(await adapter.encode({ file, config: firstPreset().encoder })).toEqual({
      kind: "rendering",
      frame: 70,
      progress: 1,
    });
    expect(adapter.pause()).toEqual({ kind: "rendering", frame: 70, progress: 1 });
    expect(adapter.resume()).toEqual({ kind: "rendering", frame: 71, progress: 1 });
    expect(adapter.resize()).toBeUndefined();
    expect(await adapter.encode({ file, config: firstPreset().encoder })).toEqual({
      kind: "rendering",
      frame: 71,
      progress: 1,
    });
  });
});
