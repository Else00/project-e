import { describe, expect, it } from "vitest";
import {
  byteSize,
  chunkSize,
  encodeId,
  fps,
  percent,
  redundancy,
  scalarBounds,
  unsafeByteSize,
  workerCount,
} from "./scalars";

describe("scalar constructors", () => {
  it("accepts valid values", () => {
    expect(scalarBounds.fps).toEqual({ min: 1, max: 30, step: 1 });
    expect(scalarBounds.chunkSizeMiB).toEqual({ min: 0.25, max: 15, step: 0.25 });
    expect(byteSize(0).kind).toBe("ok");
    expect(chunkSize(256 * 1024).kind).toBe("ok");
    expect(fps(12).kind).toBe("ok");
    expect(percent(0.5).kind).toBe("ok");
    expect(encodeId(65_535).kind).toBe("ok");
    expect(workerCount(8).kind).toBe("ok");
    expect(redundancy(2.25).kind).toBe("ok");
    expect(unsafeByteSize(42)).toBe(42);
  });

  it("rejects invalid values with explicit reasons", () => {
    expect(byteSize(-1)).toEqual({
      kind: "err",
      reason: "Byte size must be a non-negative integer.",
    });
    expect(byteSize(1.5).kind).toBe("err");
    expect(chunkSize(128 * 1024)).toEqual({
      kind: "err",
      reason: "Chunk size must be between 256 KiB and 15 MiB.",
    });
    expect(chunkSize(16 * 1024 * 1024).kind).toBe("err");
    expect(fps(0)).toEqual({ kind: "err", reason: "FPS must be an integer between 1 and 30." });
    expect(fps(12.5).kind).toBe("err");
    expect(percent(-0.1)).toEqual({ kind: "err", reason: "Percent must be between 0 and 1." });
    expect(percent(1.1).kind).toBe("err");
    expect(encodeId(65_536)).toEqual({
      kind: "err",
      reason: "Encode id must be an integer between 0 and 65535.",
    });
    expect(encodeId(1.2).kind).toBe("err");
    expect(workerCount(0)).toEqual({
      kind: "err",
      reason: "Worker count must be an integer between 1 and 8.",
    });
    expect(workerCount(2.2).kind).toBe("err");
    expect(redundancy(0.9)).toEqual({
      kind: "err",
      reason: "Redundancy must be between 1.0 and 5.0.",
    });
    expect(redundancy(Number.NaN).kind).toBe("err");
    expect(() => unsafeByteSize(-1)).toThrow("Byte size");
  });
});
