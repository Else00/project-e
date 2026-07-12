import type { CapabilityCheck, CapabilityState, CapabilityStatus } from "../../domain/state";

type ReadyCapabilityState = Extract<CapabilityState, { readonly kind: "ready" }>;

export type CapabilityEnvironment = Readonly<{
  hasWebAssembly: boolean;
  hasWorker: boolean;
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasVideoFrame: boolean;
  hasRequestVideoFrameCallback: boolean;
  hasBlobDownload: boolean;
  hasFileSystemAccess: boolean;
}>;

export function readCapabilityEnvironment(
  globalObject: Window & typeof globalThis,
): CapabilityEnvironment {
  return {
    hasWebAssembly: typeof globalObject.WebAssembly !== "undefined",
    hasWorker: typeof globalObject.Worker !== "undefined",
    isSecureContext: globalObject.isSecureContext || globalObject.location.hostname === "localhost",
    hasMediaDevices: Boolean(globalObject.navigator.mediaDevices?.getUserMedia),
    hasVideoFrame: typeof globalObject.VideoFrame !== "undefined",
    hasRequestVideoFrameCallback:
      typeof globalObject.HTMLVideoElement !== "undefined" &&
      "requestVideoFrameCallback" in globalObject.HTMLVideoElement.prototype,
    hasBlobDownload:
      typeof globalObject.Blob !== "undefined" &&
      typeof globalObject.URL.createObjectURL === "function",
    hasFileSystemAccess: "showSaveFilePicker" in globalObject,
  };
}

export function buildCapabilityChecks(env: CapabilityEnvironment): readonly CapabilityCheck[] {
  return [
    {
      id: "wasm",
      label: "WebAssembly codec",
      ok: env.hasWebAssembly,
      requiredFor: "both",
      detail: env.hasWebAssembly ? "Cimbar WASM can load." : "Encode/decode require WebAssembly.",
    },
    {
      id: "worker",
      label: "Workers",
      ok: env.hasWorker,
      requiredFor: "decode",
      detail: env.hasWorker
        ? "Camera frames can decode off the UI thread."
        : "Decoder needs a Worker.",
    },
    {
      id: "secure-context",
      label: "Secure context",
      ok: env.isSecureContext,
      requiredFor: "decode",
      detail: env.isSecureContext
        ? "Camera APIs are allowed."
        : "Use HTTPS or localhost for camera.",
    },
    {
      id: "camera",
      label: "Camera API",
      ok: env.hasMediaDevices,
      requiredFor: "decode",
      detail: env.hasMediaDevices
        ? "Browser exposes getUserMedia."
        : "Camera decode is unavailable.",
    },
    {
      id: "video-frame",
      label: "Video frame optimization",
      ok: env.hasVideoFrame && env.hasRequestVideoFrameCallback,
      requiredFor: "optional",
      detail:
        env.hasVideoFrame && env.hasRequestVideoFrameCallback
          ? "Frame extraction can use the upstream WebCodecs path."
          : "Decoder will try the canvas/RGBA fallback path.",
    },
    {
      id: "download",
      label: "Local download",
      ok: env.hasBlobDownload,
      requiredFor: "both",
      detail: env.hasBlobDownload
        ? "Decoded files can be saved locally."
        : "Download is unavailable.",
    },
    {
      id: "file-system-access",
      label: "File picker save",
      ok: env.hasFileSystemAccess,
      requiredFor: "optional",
      detail: env.hasFileSystemAccess
        ? "Streaming save may be available."
        : "Blob download fallback will be used.",
    },
  ];
}

export function summarizeCapability(checks: readonly CapabilityCheck[]): ReadyCapabilityState {
  const bothFailed = checks.some((check) => check.requiredFor === "both" && !check.ok);
  const decodeFailed = checks.some((check) => check.requiredFor === "decode" && !check.ok);
  const encodeFailed = checks.some((check) => check.requiredFor === "encode" && !check.ok);
  const status: CapabilityStatus =
    bothFailed || encodeFailed ? "unsupported" : decodeFailed ? "degraded" : "supported";
  return { kind: "ready", status, checks };
}
