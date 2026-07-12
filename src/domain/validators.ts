import { percent, type ByteSize, type Percent, unsafeByteSize } from "./scalars";
import type { CapabilityCheck, DecodeProgress } from "./state";

export type RuntimeInputResult<T> =
  | Readonly<{ kind: "ok"; value: T }>
  | Readonly<{ kind: "err"; reason: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function safeFileName(name: string): string {
  const trimmed = name.trim().replace(/[/:\\]/g, "_");
  return trimmed.length === 0 ? "unnamed.bin" : trimmed.slice(0, 160);
}

export function parseWasmReport(input: unknown): RuntimeInputResult<readonly DecodeProgress[]> {
  if (!Array.isArray(input)) {
    return { kind: "err", reason: "WASM report must be an array." };
  }
  const parsed: DecodeProgress[] = [];
  for (const [index, item] of input.entries()) {
    const value = typeof item === "number" ? item : isRecord(item) ? item.progress : undefined;
    if (typeof value !== "number") {
      return { kind: "err", reason: `Report item ${index} is not numeric.` };
    }
    const parsedPercent = percent(value);
    if (parsedPercent.kind === "err") {
      return { kind: "err", reason: `Report item ${index}: ${parsedPercent.reason}` };
    }
    parsed.push({ streamId: `stream-${index + 1}`, progress: parsedPercent.value });
  }
  return { kind: "ok", value: parsed };
}

export type WorkerInboundMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "noData" }>
  | Readonly<{ kind: "failedExtract" }>
  | Readonly<{ kind: "decoded"; mode: number; bytes: Uint8Array }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "unknown"; original: unknown }>;

export function parseWorkerMessage(input: unknown): WorkerInboundMessage {
  if (!isRecord(input)) {
    return { kind: "unknown", original: input };
  }
  if (input.ready === "ready!" || input.type === "startWasm") {
    return input.error ? { kind: "error", message: String(input.error) } : { kind: "ready" };
  }
  if (input.nodata === true) {
    return { kind: "noData" };
  }
  if (input.failed_extract === true) {
    return { kind: "failedExtract" };
  }
  if (input.error === true || input.res) {
    return { kind: "error", message: String(input.res ?? "Decoder worker error.") };
  }
  const buff = input.buff;
  const mode = input.mode;
  if (buff instanceof Uint8Array && typeof mode === "number") {
    return { kind: "decoded", mode, bytes: buff };
  }
  return { kind: "unknown", original: input };
}

export function parseCapabilityChecks(checks: readonly CapabilityCheck[]): RuntimeInputResult<{
  readonly encodeReady: boolean;
  readonly decodeReady: boolean;
}> {
  const encodeReady = checks.every((check) => check.requiredFor !== "encode" || check.ok);
  const bothReady = checks.every((check) => check.requiredFor !== "both" || check.ok);
  const decodeReady = checks.every((check) => check.requiredFor !== "decode" || check.ok);
  return {
    kind: "ok",
    value: { encodeReady: encodeReady && bothReady, decodeReady: decodeReady && bothReady },
  };
}

export function byteSizeFromFileLike(file: Pick<File, "size">): ByteSize {
  return unsafeByteSize(file.size);
}

export function formatBytes(size: ByteSize): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KiB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

export function formatPercent(value: Percent): string {
  return `${Math.round(value * 100)}%`;
}
