import { describe, expect, it } from "vitest";
import { createTransferPresets } from "../../domain/cimbar";
import {
  activeChunk,
  bigfileBrowserSessionLimit,
  bigfileEncoderConfig,
  createBigfilePlan,
  shouldUseNativeBigfile,
} from "./bigfilePlan";

function encoderConfig() {
  const [preset] = createTransferPresets(1_000);
  if (!preset) throw new Error("Expected preset.");
  return preset.encoder;
}

describe("bigfile planner", () => {
  it("distinguishes empty, direct and planned transfers", () => {
    expect(createBigfilePlan(null, encoderConfig())).toEqual({
      kind: "empty",
      message: "Choose a file to see the cimbar-bigfile plan.",
    });
    expect(createBigfilePlan({ name: "small.bin", size: 1_024 }, encoderConfig())).toMatchObject({
      kind: "direct-preferred",
      fileName: "small.bin",
      chunkCount: 1,
      encodeStreams: 1,
    });

    const config = bigfileEncoderConfig(encoderConfig(), {
      name: "folder/big.bin",
      size: 80 * 1_024 * 1_024,
    });
    const plan = createBigfilePlan({ name: "folder/big.bin", size: 80 * 1_024 * 1_024 }, config);
    expect(plan).toMatchObject({
      kind: "planned",
      fileName: "folder_big.bin",
      chunkCount: 8,
      encodeStreams: 2,
      hashRequired: true,
    });
    if (plan.kind !== "planned") throw new Error("Expected planned transfer.");
    expect(plan.chunks[0]).toMatchObject({
      index: 0,
      fileName: "folder_big.bin.part-0001-of-0008",
      encodeId: config.encodeIdBase,
    });
  });

  it("blocks files above the browser session policy", () => {
    expect(
      createBigfilePlan(
        { name: "too-large.bin", size: bigfileBrowserSessionLimit + 1 },
        encoderConfig(),
      ),
    ).toMatchObject({
      kind: "blocked",
      fileName: "too-large.bin",
      chunkCount: 52,
    });
  });

  it("applies automatic sender settings and bounds active chunks", () => {
    const file = { name: "archive.bin", size: 11 * 1_024 * 1_024 };
    const config = bigfileEncoderConfig(encoderConfig(), file);
    expect(config).toMatchObject({
      mode: "b",
      encodeIdStrategy: "manual",
      colorBalance: true,
      wakeLock: true,
    });
    expect(shouldUseNativeBigfile(file)).toBe(true);
    expect(shouldUseNativeBigfile(null)).toBe(false);
    expect(shouldUseNativeBigfile({ size: bigfileBrowserSessionLimit + 1 })).toBe(false);

    const plan = createBigfilePlan(file, config);
    if (plan.kind !== "planned") throw new Error("Expected planned transfer.");
    expect(activeChunk(plan, -1)).toBe(plan.chunks[0]);
    expect(activeChunk(plan, Number.MAX_SAFE_INTEGER)).toBe(plan.chunks.at(-1));
  });
});
