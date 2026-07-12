import { type EncoderConfig, unwrapScalarResult } from "../../domain/cimbar";
import type { ByteSize, EncodeId } from "../../domain/scalars";
import { chunkSize, fps, redundancy, unsafeByteSize } from "../../domain/scalars";
import { safeFileName } from "../../domain/validators";
import { recommendedSingleFileLimit, warningSingleFileLimit } from "../limits/filePolicy";

export const bigfileChunkBytes = 10 * 1024 * 1024;
export const bigfileBrowserSessionLimit = 512 * 1024 * 1024;

export type BigfileChunk = Readonly<{
  index: number;
  start: ByteSize;
  end: ByteSize;
  size: ByteSize;
  encodeId: EncodeId;
  fileName: string;
}>;

type RenderableBigfilePlanFields = Readonly<{
  fileName: string;
  size: ByteSize;
  chunkBytes: ByteSize;
  chunkCount: number;
  encodeStreams: number;
  chunks: readonly BigfileChunk[];
  message: string;
}>;

export type BigfilePlan =
  | Readonly<{ kind: "empty"; message: string }>
  | Readonly<{ kind: "direct-preferred" } & RenderableBigfilePlanFields>
  | Readonly<
      {
        kind: "planned";
        recommendedReceiver: "CFC Android";
        reassembly: "reassemble.html";
        hashRequired: true;
      } & RenderableBigfilePlanFields
    >
  | Readonly<{
      kind: "blocked";
      fileName: string;
      size: ByteSize;
      chunkBytes: ByteSize;
      chunkCount: number;
      message: string;
      recovery: string;
    }>;

function plannedStreams(size: number): number {
  if (size <= warningSingleFileLimit) {
    return 1;
  }
  return Math.min(16, Math.max(2, Math.ceil(size / (100 * 1024 * 1024))));
}

function deriveEncodeIdBase(file: Pick<File, "name" | "size">): EncodeId {
  let hash = file.size & 0xffff;
  for (const character of file.name) {
    hash = (hash * 31 + character.charCodeAt(0)) & 0xffff;
  }
  return hash as EncodeId;
}

function nextEncodeId(base: EncodeId, index: number): EncodeId {
  return ((base + index) & 0xffff) as EncodeId;
}

function renderableChunks(
  file: Pick<File, "name" | "size">,
  safeName: string,
  chunkBytes: number,
  baseEncodeId: EncodeId,
): readonly BigfileChunk[] {
  const chunkCount = Math.max(1, Math.ceil(file.size / chunkBytes));
  return Array.from({ length: chunkCount }, (_, index) => {
    const start = unsafeByteSize(index * chunkBytes);
    const end = unsafeByteSize(Math.min(file.size, (index + 1) * chunkBytes));
    const size = unsafeByteSize(end - start);
    return {
      index,
      start,
      end,
      size,
      encodeId: nextEncodeId(baseEncodeId, index),
      fileName: `${safeName}.part-${String(index + 1).padStart(4, "0")}-of-${String(chunkCount).padStart(4, "0")}`,
    };
  });
}

export function shouldUseNativeBigfile(file: Pick<File, "size"> | null): boolean {
  return Boolean(
    file && file.size > recommendedSingleFileLimit && file.size <= bigfileBrowserSessionLimit,
  );
}

export function bigfileEncoderConfig(config: EncoderConfig, file: Pick<File, "name" | "size">) {
  return {
    ...config,
    mode: "b" as const,
    fps: unwrapScalarResult(fps(10)),
    redundancy: unwrapScalarResult(redundancy(3.5)),
    chunkSize: unwrapScalarResult(chunkSize(bigfileChunkBytes)),
    encodeIdBase: deriveEncodeIdBase(file),
    encodeIdStrategy: "manual" as const,
    colorBalance: true,
    wakeLock: true,
  };
}

export function createBigfilePlan(
  file: Pick<File, "name" | "size"> | null,
  config: EncoderConfig,
): BigfilePlan {
  if (!file) {
    return { kind: "empty", message: "Choose a file to see the cimbar-bigfile plan." };
  }
  const size = unsafeByteSize(file.size);
  const fileName = safeFileName(file.name);
  const chunkBytes = unsafeByteSize(config.chunkSize);
  const baseEncodeId =
    config.encodeIdStrategy === "manual" ? config.encodeIdBase : deriveEncodeIdBase(file);
  const chunks = renderableChunks(file, fileName, chunkBytes, baseEncodeId);
  const chunkCount = chunks.length;
  const encodeStreams = plannedStreams(size);
  if (size > bigfileBrowserSessionLimit) {
    return {
      kind: "blocked",
      fileName,
      size,
      chunkBytes,
      chunkCount,
      message: "This browser session is too large for the bundled bigfile planner.",
      recovery: "Use native libcimbar/cimbar-bigfile tooling or split below 512 MiB.",
    };
  }
  if (size <= recommendedSingleFileLimit) {
    return {
      kind: "direct-preferred",
      fileName,
      size,
      chunkBytes,
      chunkCount,
      encodeStreams,
      chunks,
      message:
        "Direct Cimbar mode is simpler for this file; bigfile remains available for testing.",
    };
  }
  return {
    kind: "planned",
    fileName,
    size,
    chunkBytes,
    chunkCount,
    encodeStreams,
    chunks,
    recommendedReceiver: "CFC Android",
    reassembly: "reassemble.html",
    hashRequired: true,
    message:
      "Use cimbar-bigfile style chunking, receive with CFC Android, then reassemble and verify BLAKE3.",
  };
}

export function activeChunk(
  plan: Exclude<BigfilePlan, { readonly kind: "empty" | "blocked" }>,
  index: number,
): BigfileChunk {
  const boundedIndex = Math.min(Math.max(index, 0), plan.chunks.length - 1);
  return plan.chunks[boundedIndex] as BigfileChunk;
}
