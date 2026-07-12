import { describe, expect, it, vi } from "vitest";
import {
  type CapabilityEnvironment,
  buildCapabilityChecks,
  readCapabilityEnvironment,
  summarizeCapability,
} from "./capabilities";

const readyEnv: CapabilityEnvironment = {
  hasWebAssembly: true,
  hasWorker: true,
  isSecureContext: true,
  hasMediaDevices: true,
  hasVideoFrame: true,
  hasRequestVideoFrameCallback: true,
  hasBlobDownload: true,
  hasFileSystemAccess: true,
};

describe("browser capability checks", () => {
  it("summarizes a fully supported browser", () => {
    const checks = buildCapabilityChecks(readyEnv);
    expect(checks).toHaveLength(7);
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(summarizeCapability(checks)).toEqual({ kind: "ready", status: "supported", checks });
  });

  it("explains each missing browser capability", () => {
    const checks = buildCapabilityChecks({
      hasWebAssembly: false,
      hasWorker: false,
      isSecureContext: false,
      hasMediaDevices: false,
      hasVideoFrame: false,
      hasRequestVideoFrameCallback: false,
      hasBlobDownload: false,
      hasFileSystemAccess: false,
    });
    expect(checks.map((check) => check.detail)).toEqual([
      "Encode/decode require WebAssembly.",
      "Decoder needs a Worker.",
      "Use HTTPS or localhost for camera.",
      "Camera decode is unavailable.",
      "Decoder will try the canvas/RGBA fallback path.",
      "Download is unavailable.",
      "Blob download fallback will be used.",
    ]);
  });

  it("keeps Safari-like camera decode enabled without WebCodecs VideoFrame", () => {
    const checks = buildCapabilityChecks({
      ...readyEnv,
      hasVideoFrame: false,
      hasRequestVideoFrameCallback: true,
    });
    const state = summarizeCapability(checks);
    expect(state.status).toBe("supported");
    expect(checks.find((check) => check.id === "video-frame")).toMatchObject({
      ok: false,
      requiredFor: "optional",
    });
  });

  it("reports degraded and unsupported capability states", () => {
    const degraded = buildCapabilityChecks({ ...readyEnv, hasWorker: false });
    const degradedState = summarizeCapability(degraded);
    expect(degradedState.kind).toBe("ready");
    expect(degradedState.status).toBe("degraded");
    const unsupported = buildCapabilityChecks({
      ...readyEnv,
      hasFileSystemAccess: false,
      hasBlobDownload: false,
    });
    const unsupportedState = summarizeCapability(unsupported);
    expect(unsupportedState.kind).toBe("ready");
    expect(unsupportedState.status).toBe("unsupported");
    expect(
      summarizeCapability([
        { id: "encode-only", label: "Encode", ok: false, requiredFor: "encode", detail: "missing" },
      ]).status,
    ).toBe("unsupported");
  });

  it("reads browser globals without taking camera access", () => {
    const createObjectURL = vi.fn();
    const globalObject = {
      WebAssembly: {},
      Worker: function Worker() {},
      isSecureContext: false,
      location: { hostname: "localhost" },
      navigator: { mediaDevices: { getUserMedia: vi.fn() } },
      VideoFrame: function VideoFrame() {},
      HTMLVideoElement: window.HTMLVideoElement,
      Blob,
      URL: { createObjectURL },
      showSaveFilePicker: vi.fn(),
    } as unknown as Window & typeof globalThis;
    expect(readCapabilityEnvironment(globalObject)).toMatchObject({
      hasWebAssembly: true,
      hasWorker: true,
      isSecureContext: true,
      hasMediaDevices: true,
      hasVideoFrame: true,
      hasBlobDownload: true,
      hasFileSystemAccess: true,
    });
    expect(globalObject.navigator.mediaDevices?.getUserMedia).not.toHaveBeenCalled();
  });
});
