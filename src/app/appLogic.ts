import type { DecoderConfig, EncoderConfig } from "../domain/cimbar";
import { assertNever } from "../domain/assertNever";
import { chunkSize, encodeId, fps, redundancy, workerCount } from "../domain/scalars";
import type { DecoderState, DecodeProgress, DownloadState, FileValidation } from "../domain/state";
import type { BigfileReassemblyState } from "../features/bigfile/bigfileReassembly";
import type { ReassemblyIntegrityState } from "./appTypes";

export const fileValidationTone = (
  validation: FileValidation,
): "neutral" | "success" | "warning" | "danger" => {
  switch (validation.kind) {
    case "empty":
      return "neutral";
    case "valid":
      return "success";
    case "warning":
      return "warning";
    case "blocked":
      return "danger";
    default:
      return assertNever(validation);
  }
};

export const validationMessage = (validation: FileValidation): string => {
  switch (validation.kind) {
    case "empty":
      return "";
    case "valid":
      return validation.message;
    case "warning":
      return `${validation.message} ${validation.recovery}`;
    case "blocked":
      return `${validation.message} ${validation.recovery}`;
    default:
      return assertNever(validation);
  }
};

export function estimateChunks(validation: FileValidation, config: EncoderConfig): number {
  if (validation.kind === "empty") {
    return 0;
  }
  return Math.max(1, Math.ceil(validation.size / config.chunkSize));
}

export function estimateTransferMinutes(validation: FileValidation, config: EncoderConfig): string {
  if (validation.kind === "empty") {
    return "No estimate";
  }
  const effectiveBytesPerSecond = 92 * 1024 * (config.fps / 12);
  const seconds = (validation.size * config.redundancy) / effectiveBytesPerSecond;
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} sec`;
  }
  return `${Math.ceil(seconds / 60)} min`;
}

export function updateEncoderNumber<K extends keyof EncoderConfig>(
  config: EncoderConfig,
  key: K,
  rawValue: number,
): EncoderConfig {
  if (key === "fps") {
    const parsed = fps(rawValue);
    return parsed.kind === "ok" ? { ...config, fps: parsed.value } : config;
  }
  if (key === "redundancy") {
    const parsed = redundancy(rawValue);
    return parsed.kind === "ok" ? { ...config, redundancy: parsed.value } : config;
  }
  if (key === "chunkSize") {
    const parsed = chunkSize(rawValue);
    return parsed.kind === "ok" ? { ...config, chunkSize: parsed.value } : config;
  }
  if (key === "encodeIdBase") {
    const parsed = encodeId(rawValue);
    return parsed.kind === "ok" ? { ...config, encodeIdBase: parsed.value } : config;
  }
  return config;
}

export function updateDecoderNumber<K extends keyof DecoderConfig>(
  config: DecoderConfig,
  key: K,
  rawValue: number,
): DecoderConfig {
  if (key === "workers") {
    const parsed = workerCount(rawValue);
    return parsed.kind === "ok" ? { ...config, workers: parsed.value } : config;
  }
  if (key === "frameRateLimit") {
    const parsed = fps(rawValue);
    return parsed.kind === "ok" ? { ...config, frameRateLimit: parsed.value } : config;
  }
  return config;
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function percentLabel(value: number): string {
  return `${Math.round(clampProgress(value) * 100)}%`;
}

function streamProgressPercent(streams: readonly DecodeProgress[]): number {
  if (streams.length === 0) {
    return 0;
  }
  return clampProgress(Math.max(...streams.map((stream) => stream.progress)));
}

function scannerActivityPercent(state: Extract<DecoderState, { kind: "scanning" }>): number {
  const diagnostics = state.diagnostics;
  if (!diagnostics || diagnostics.postedFrames === 0) {
    return 0;
  }
  const handled =
    diagnostics.noDataFrames + diagnostics.failedExtractFrames + diagnostics.decodedFrames;
  return clampProgress(handled / Math.max(1, diagnostics.postedFrames));
}

function diagnosticSummary(
  state: Extract<DecoderState, { kind: "scanning" | "decoding" }>,
): string {
  const diagnostics = state.diagnostics;
  if (!diagnostics) {
    return state.kind === "scanning"
      ? "Camera active; waiting for the first sampled frame."
      : "Waiting for fountain progress report.";
  }
  const frame = diagnostics.lastFrame
    ? ` · ${diagnostics.lastFrame.format} ${diagnostics.lastFrame.width}x${diagnostics.lastFrame.height}`
    : "";
  return (
    [
      `sampled ${diagnostics.sampledFrames}`,
      `posted ${diagnostics.postedFrames}`,
      `no data ${diagnostics.noDataFrames}`,
      `extract fail ${diagnostics.failedExtractFrames}`,
      `buffers ${diagnostics.decodedFrames}`,
      `in flight ${diagnostics.inFlightFrames}`,
    ].join(" · ") + frame
  );
}

export function decoderProgressInfo(state: DecoderState): Readonly<{
  value: number;
  label: string;
  detail: string;
}> {
  switch (state.kind) {
    case "decoding": {
      const value = streamProgressPercent(state.streams);
      return {
        value,
        label: percentLabel(value),
        detail:
          state.streams.length === 0
            ? diagnosticSummary(state)
            : `${state.streams.length} stream${state.streams.length === 1 ? "" : "s"} reporting. ${diagnosticSummary(state)}`,
      };
    }
    case "complete":
      return { value: 1, label: "100%", detail: "Decode complete." };
    case "scanning":
      return {
        value: scannerActivityPercent(state),
        label: `${state.frames} frames`,
        detail: diagnosticSummary(state),
      };
    default:
      return { value: 0, label: "0%", detail: "Decoder idle." };
  }
}

export function reassemblyProgressPercent(state: BigfileReassemblyState): number {
  switch (state.kind) {
    case "empty":
      return 0;
    case "collecting":
      return clampProgress(state.received.length / state.chunkCount);
    case "complete":
      return 1;
    default:
      return assertNever(state);
  }
}

export function bytesDownload(fileName: string, bytes: Uint8Array): DownloadState {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const blob = new Blob([body], { type: "application/octet-stream" });
  return { kind: "ready", fileName, url: URL.createObjectURL(blob) };
}

export function reassemblyProgressLabel(state: BigfileReassemblyState): string {
  switch (state.kind) {
    case "empty":
      return "Waiting";
    case "collecting":
      return `${state.received.length}/${state.chunkCount}`;
    case "complete":
      return `${state.chunkCount}/${state.chunkCount}`;
    default:
      return assertNever(state);
  }
}

export function reassemblyMissingLabel(state: BigfileReassemblyState): string {
  switch (state.kind) {
    case "empty":
      return "Scan transfer";
    case "collecting":
      return state.missingNumbers.length === 0 ? "none" : state.missingNumbers.join(", ");
    case "complete":
      return "none";
    default:
      return assertNever(state);
  }
}

export function reassemblyStatusMessage(
  state: BigfileReassemblyState,
  integrity: ReassemblyIntegrityState,
  error: string | null,
): string {
  if (error) {
    return error;
  }
  switch (integrity.kind) {
    case "failed":
    case "verified":
    case "checking":
      return integrity.message;
    case "missing":
      return state.kind === "complete" ? integrity.message : state.message;
    case "idle":
      return state.message;
    default:
      return assertNever(integrity);
  }
}

export function canDownloadReassembledFile(
  download: DownloadState,
  integrity: ReassemblyIntegrityState,
): boolean {
  return download.kind === "ready" && integrity.kind !== "failed" && integrity.kind !== "checking";
}
