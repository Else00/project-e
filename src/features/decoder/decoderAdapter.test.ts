import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransferPresets } from "../../domain/cimbar";
import { createCameraDecoderAdapter } from "./decoderAdapter";

function firstPreset() {
  const [preset] = createTransferPresets(1_000);
  if (!preset) {
    throw new Error("Expected at least one transfer preset.");
  }
  return preset;
}

describe("camera decoder adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains unavailable camera decode", async () => {
    const adapter = createCameraDecoderAdapter(false);
    await expect(adapter.start(firstPreset().decoder)).resolves.toMatchObject({
      kind: "error",
      message: "Camera decode is not available in this browser.",
    });
  });

  it("requests camera and stops active tracks", async () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [
        {
          getSettings: () => ({
            width: 1920,
            height: 1080,
            frameRate: 30,
            facingMode: "environment",
            aspectRatio: 16 / 9,
          }),
          getCapabilities: () => ({ torch: [true], zoom: { min: 1, max: 4 } }),
        },
      ],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const onEvent = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const adapter = createCameraDecoderAdapter(true, () => null, onEvent);
    await expect(adapter.start(firstPreset().decoder)).resolves.toMatchObject({
      kind: "camera-ready",
      stream,
      diagnostics: {
        camera: {
          width: 1920,
          height: 1080,
          frameRate: 30,
          facingMode: "environment",
          supportsTorch: true,
          supportsZoom: true,
        },
      },
    });
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({
          aspectRatio: { ideal: 16 / 9 },
          facingMode: { ideal: "environment" },
          height: { ideal: 2160 },
          width: { ideal: 3840 },
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "diagnostic",
        diagnostics: expect.objectContaining({
          camera: expect.objectContaining({ width: 1920, height: 1080 }),
        }),
      }),
    );
    await expect(adapter.stop()).resolves.toEqual({ kind: "progress", streams: [] });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("explains missing media devices", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const adapter = createCameraDecoderAdapter(true);
    await expect(adapter.start(firstPreset().decoder)).resolves.toEqual({
      kind: "error",
      message: "Camera access is not available in this browser.",
      recovery: "Use HTTPS or localhost in a browser with MediaDevices support.",
    });
    await expect(adapter.stop()).resolves.toEqual({ kind: "progress", streams: [] });
  });

  it("starts without an attached preview element", async () => {
    const stream = {
      getTracks: () => [],
      getVideoTracks: () => [],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
    const adapter = createCameraDecoderAdapter(true);
    await expect(adapter.start(firstPreset().decoder)).resolves.toMatchObject({
      kind: "camera-ready",
      stream,
    });
  });

  it("surfaces camera permission failures", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    const adapter = createCameraDecoderAdapter(true);
    await expect(adapter.start(firstPreset().decoder)).resolves.toEqual({
      kind: "error",
      message: "denied",
      recovery: "Allow camera access, then start scanning again.",
    });
  });

  it("uses a stable fallback for non-error camera failures", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => Promise.reject("denied")) },
    });
    const adapter = createCameraDecoderAdapter(true);
    await expect(adapter.start(firstPreset().decoder)).resolves.toEqual({
      kind: "error",
      message: "Camera permission was denied.",
      recovery: "Allow camera access, then start scanning again.",
    });
  });
});
