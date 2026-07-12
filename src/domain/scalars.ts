type Brand<TName extends string> = { readonly __brand: TName };

export type ByteSize = number & Brand<"ByteSize">;
export type Fps = number & Brand<"Fps">;
export type Percent = number & Brand<"Percent">;
export type EncodeId = number & Brand<"EncodeId">;
export type WorkerCount = number & Brand<"WorkerCount">;
export type Redundancy = number & Brand<"Redundancy">;
export type ChunkSize = ByteSize & Brand<"ChunkSize">;

export type ScalarResult<T> =
  | Readonly<{ kind: "ok"; value: T }>
  | Readonly<{ kind: "err"; reason: string }>;

export const scalarBounds = {
  chunkSizeBytes: { min: 256 * 1024, max: 15 * 1024 * 1024, step: 256 * 1024 },
  chunkSizeMiB: { min: 0.25, max: 15, step: 0.25 },
  fps: { min: 1, max: 30, step: 1 },
  encodeId: { min: 0, max: 65_535, step: 1 },
  workerCount: { min: 1, max: 8, step: 1 },
  redundancy: { min: 1, max: 5, step: 0.05 },
} as const;

const isFiniteInteger = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value);

export function byteSize(value: number): ScalarResult<ByteSize> {
  if (!isFiniteInteger(value) || value < 0) {
    return { kind: "err", reason: "Byte size must be a non-negative integer." };
  }
  return { kind: "ok", value: value as ByteSize };
}

export function chunkSize(value: number): ScalarResult<ChunkSize> {
  const { min, max } = scalarBounds.chunkSizeBytes;
  if (!isFiniteInteger(value) || value < min || value > max) {
    return {
      kind: "err",
      reason: "Chunk size must be between 256 KiB and 15 MiB.",
    };
  }
  return { kind: "ok", value: value as ChunkSize };
}

export function fps(value: number): ScalarResult<Fps> {
  const { min, max } = scalarBounds.fps;
  if (!isFiniteInteger(value) || value < min || value > max) {
    return { kind: "err", reason: "FPS must be an integer between 1 and 30." };
  }
  return { kind: "ok", value: value as Fps };
}

export function percent(value: number): ScalarResult<Percent> {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return { kind: "err", reason: "Percent must be between 0 and 1." };
  }
  return { kind: "ok", value: value as Percent };
}

export function encodeId(value: number): ScalarResult<EncodeId> {
  const { min, max } = scalarBounds.encodeId;
  if (!isFiniteInteger(value) || value < min || value > max) {
    return { kind: "err", reason: "Encode id must be an integer between 0 and 65535." };
  }
  return { kind: "ok", value: value as EncodeId };
}

export function workerCount(value: number): ScalarResult<WorkerCount> {
  const { min, max } = scalarBounds.workerCount;
  if (!isFiniteInteger(value) || value < min || value > max) {
    return { kind: "err", reason: "Worker count must be an integer between 1 and 8." };
  }
  return { kind: "ok", value: value as WorkerCount };
}

export function redundancy(value: number): ScalarResult<Redundancy> {
  const { min, max } = scalarBounds.redundancy;
  if (!Number.isFinite(value) || value < min || value > max) {
    return { kind: "err", reason: "Redundancy must be between 1.0 and 5.0." };
  }
  return { kind: "ok", value: value as Redundancy };
}

export function unsafeByteSize(value: number): ByteSize {
  const parsed = byteSize(value);
  if (parsed.kind === "err") {
    throw new Error(parsed.reason);
  }
  return parsed.value;
}
