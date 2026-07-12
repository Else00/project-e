import type { ChunkSize, EncodeId, Fps, Redundancy, WorkerCount } from "./scalars";
import { chunkSize, encodeId, fps, redundancy, workerCount } from "./scalars";

export const CIMBAR_MODES = ["auto", "4c", "b", "bm", "bu"] as const;
export type CimbarMode = (typeof CIMBAR_MODES)[number];

export const ENCODE_MODES = ["4c", "b", "bm", "bu"] as const;
export type EncodeMode = (typeof ENCODE_MODES)[number];

export const modeLabels: Readonly<Record<CimbarMode, string>> = {
  auto: "Auto",
  "4c": "4C",
  b: "B",
  bm: "Bm",
  bu: "Bu",
};

export const wasmModeValues: Readonly<Record<EncodeMode, number>> = {
  "4c": 4,
  bu: 66,
  bm: 67,
  b: 68,
};

export type EncoderConfig = Readonly<{
  mode: EncodeMode;
  fps: Fps;
  redundancy: Redundancy;
  chunkSize: ChunkSize;
  encodeIdBase: EncodeId;
  encodeIdStrategy: "auto" | "manual";
  colorBalance: boolean;
  fullscreen: boolean;
  fullscreenMargin: boolean;
  wakeLock: boolean;
}>;

export type DecoderConfig = Readonly<{
  mode: CimbarMode;
  workers: WorkerCount;
  frameRateLimit: Fps;
  autoDetect: boolean;
  preferNativeFormats: boolean;
}>;

export type TransferPresetId = "balanced" | "fast" | "robust" | "largeCareful";

export type TransferPreset = Readonly<{
  id: TransferPresetId;
  name: string;
  summary: string;
  bestFor: string;
  encoder: EncoderConfig;
  decoder: DecoderConfig;
}>;

export type ConfigIssueSeverity = "info" | "warning" | "error";

export type ConfigIssue = Readonly<{
  id: string;
  severity: ConfigIssueSeverity;
  field: string;
  message: string;
  recovery: string;
}>;

export function unwrapScalarResult<T>(
  result:
    | { readonly kind: "ok"; readonly value: T }
    | { readonly kind: "err"; readonly reason: string },
): T {
  if (result.kind === "err") {
    throw new Error(result.reason);
  }
  return result.value;
}

export function defaultEncodeIdBase(nowMs = Date.now()): EncodeId {
  return unwrapScalarResult(encodeId(Math.floor(nowMs / 1000) & 0xffff));
}

export function createTransferPresets(nowMs = Date.now()): readonly TransferPreset[] {
  const id = defaultEncodeIdBase(nowMs);
  return [
    {
      id: "balanced",
      name: "Balanced",
      summary: "Default profile for handheld phone scanning.",
      bestFor: "Most tests under 10 MiB.",
      encoder: {
        mode: "b",
        fps: unwrapScalarResult(fps(12)),
        redundancy: unwrapScalarResult(redundancy(2)),
        chunkSize: unwrapScalarResult(chunkSize(10 * 1024 * 1024)),
        encodeIdBase: id,
        encodeIdStrategy: "auto",
        colorBalance: false,
        fullscreen: false,
        fullscreenMargin: false,
        wakeLock: true,
      },
      decoder: {
        mode: "auto",
        workers: unwrapScalarResult(workerCount(3)),
        frameRateLimit: unwrapScalarResult(fps(12)),
        autoDetect: true,
        preferNativeFormats: true,
      },
    },
    {
      id: "fast",
      name: "Fast",
      summary: "Fewer safety margins for controlled lab conditions.",
      bestFor: "Tripod, bright screen, short files.",
      encoder: {
        mode: "b",
        fps: unwrapScalarResult(fps(18)),
        redundancy: unwrapScalarResult(redundancy(1.35)),
        chunkSize: unwrapScalarResult(chunkSize(10 * 1024 * 1024)),
        encodeIdBase: id,
        encodeIdStrategy: "auto",
        colorBalance: false,
        fullscreen: false,
        fullscreenMargin: false,
        wakeLock: true,
      },
      decoder: {
        mode: "auto",
        workers: unwrapScalarResult(workerCount(4)),
        frameRateLimit: unwrapScalarResult(fps(18)),
        autoDetect: true,
        preferNativeFormats: true,
      },
    },
    {
      id: "robust",
      name: "Robust",
      summary: "More redundancy and calmer frame timing.",
      bestFor: "Handheld phones, glare, imperfect focus.",
      encoder: {
        mode: "b",
        fps: unwrapScalarResult(fps(10)),
        redundancy: unwrapScalarResult(redundancy(3)),
        chunkSize: unwrapScalarResult(chunkSize(5 * 1024 * 1024)),
        encodeIdBase: id,
        encodeIdStrategy: "auto",
        colorBalance: true,
        fullscreen: false,
        fullscreenMargin: false,
        wakeLock: true,
      },
      decoder: {
        mode: "auto",
        workers: unwrapScalarResult(workerCount(2)),
        frameRateLimit: unwrapScalarResult(fps(10)),
        autoDetect: true,
        preferNativeFormats: true,
      },
    },
    {
      id: "largeCareful",
      name: "Large careful",
      summary: "Conservative direct-transfer settings for larger files.",
      bestFor: "10-33 MiB direct-mode experiments.",
      encoder: {
        mode: "b",
        fps: unwrapScalarResult(fps(10)),
        redundancy: unwrapScalarResult(redundancy(3.5)),
        chunkSize: unwrapScalarResult(chunkSize(15 * 1024 * 1024)),
        encodeIdBase: id,
        encodeIdStrategy: "auto",
        colorBalance: true,
        fullscreen: false,
        fullscreenMargin: false,
        wakeLock: true,
      },
      decoder: {
        mode: "b",
        workers: unwrapScalarResult(workerCount(3)),
        frameRateLimit: unwrapScalarResult(fps(10)),
        autoDetect: false,
        preferNativeFormats: true,
      },
    },
  ];
}

export function evaluateEncoderConfig(config: EncoderConfig): readonly ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (config.mode === "bu" && config.chunkSize > 8 * 1024 * 1024) {
    issues.push({
      id: "bu-large-chunk",
      severity: "warning",
      field: "mode",
      message: "Bu mode has less practical headroom for large chunks.",
      recovery: "Use B mode or reduce chunk size below 8 MiB.",
    });
  }
  if (config.fps > 18) {
    issues.push({
      id: "high-fps",
      severity: "warning",
      field: "fps",
      message: "High FPS can outrun phone camera exposure or autofocus.",
      recovery: "Use 10-15 FPS for handheld scanning.",
    });
  }
  if (config.redundancy < 1.4) {
    issues.push({
      id: "low-redundancy",
      severity: "warning",
      field: "redundancy",
      message: "Low redundancy leaves little room for missed frames.",
      recovery: "Use 2.0x for balanced transfers.",
    });
  }
  if (config.encodeIdStrategy === "manual" && config.encodeIdBase < 1024) {
    issues.push({
      id: "low-manual-encode-id",
      severity: "warning",
      field: "encodeIdBase",
      message: "Low manual encode ids are more likely to collide with previous sessions.",
      recovery: "Use auto id or choose a higher session id.",
    });
  }
  if (!config.wakeLock) {
    issues.push({
      id: "wake-lock-off",
      severity: "info",
      field: "wakeLock",
      message: "Screen sleep can interrupt long transfers.",
      recovery: "Enable wake lock when supported or keep the device awake manually.",
    });
  }
  return issues;
}

export function evaluateDecoderConfig(config: DecoderConfig): readonly ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (config.mode !== "auto" && config.autoDetect) {
    issues.push({
      id: "manual-mode-with-auto-detect",
      severity: "info",
      field: "mode",
      message: "Manual mode takes priority over auto-detect.",
      recovery: "Use Auto mode if you want the scanner to rotate through modes.",
    });
  }
  if (config.workers > 4) {
    issues.push({
      id: "high-worker-count",
      severity: "warning",
      field: "workers",
      message: "More workers can improve decode attempts but may heat mobile devices.",
      recovery: "Use 2-4 workers unless desktop CPU headroom is available.",
    });
  }
  if (config.frameRateLimit > 18) {
    issues.push({
      id: "decoder-high-fps",
      severity: "warning",
      field: "frameRateLimit",
      message: "High camera sampling can queue frames faster than decoding.",
      recovery: "Use 10-15 FPS for stable scanning.",
    });
  }
  return issues;
}
