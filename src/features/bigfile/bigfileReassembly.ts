import { blake3 } from "@noble/hashes/blake3.js";
import type {
  BigfileChunkTransfer,
  BigfileManifestTransfer,
  DecodedProtocolEnvelope,
} from "project-e-protocol";
import { unsafeByteSize, type ByteSize } from "../../domain/scalars";
import { bigfileBrowserSessionLimit } from "./bigfilePlan";

export type BigfileReceivedChunk = Readonly<{
  number: number;
  offset: number;
  length: number;
  blake3: string;
  bytes: Uint8Array;
}>;

type CollectingFields = Readonly<{
  transferId: string;
  fileName: string;
  size: ByteSize;
  chunkCount: number;
  manifest: BigfileManifestTransfer | null;
  received: readonly BigfileReceivedChunk[];
  missingNumbers: readonly number[];
}>;

export type BigfileReassemblyState =
  | Readonly<{ kind: "empty"; message: string }>
  | (Readonly<{ kind: "collecting"; message: string }> & CollectingFields)
  | (Readonly<{ kind: "complete"; message: string; bytes: Uint8Array }> & CollectingFields);

export type ReassemblyResult =
  | Readonly<{ kind: "ok"; state: BigfileReassemblyState }>
  | Readonly<{ kind: "err"; state: BigfileReassemblyState; message: string; recovery: string }>;

export function emptyBigfileReassemblyState(): BigfileReassemblyState {
  return {
    kind: "empty",
    message: "Scan a project-e.transfer bigfile manifest or chunk to begin.",
  };
}

const digestHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const safeNumber = (value: bigint): number | null => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const fileNameFor = (transfer: BigfileManifestTransfer | BigfileChunkTransfer): string =>
  transfer.file.fileName ?? `project-e-${transfer.transferId.slice(0, 12)}.bin`;

const stateFromTransfer = (
  transfer: BigfileManifestTransfer | BigfileChunkTransfer,
): CollectingFields | null => {
  const size = safeNumber(transfer.file.size);
  if (size === null || size > bigfileBrowserSessionLimit) return null;
  return {
    transferId: transfer.transferId,
    fileName: fileNameFor(transfer),
    size: unsafeByteSize(size),
    chunkCount: transfer.chunkCount,
    manifest: transfer.kind === "bigfileManifest" ? transfer : null,
    received: [],
    missingNumbers: Array.from({ length: transfer.chunkCount }, (_, index) => index + 1),
  };
};

const collectingFields = (state: BigfileReassemblyState): CollectingFields | null =>
  state.kind === "empty" ? null : state;

const sameFile = (
  fields: CollectingFields,
  transfer: BigfileManifestTransfer | BigfileChunkTransfer,
): boolean =>
  fields.transferId === transfer.transferId &&
  fields.fileName === fileNameFor(transfer) &&
  fields.size === safeNumber(transfer.file.size) &&
  fields.chunkCount === transfer.chunkCount &&
  (fields.manifest === null || fields.manifest.file.blake3 === transfer.file.blake3);

const fail = (
  state: BigfileReassemblyState,
  message: string,
  recovery: string,
): ReassemblyResult => ({ kind: "err", state, message, recovery });

const chunkMatchesManifest = (
  chunk: BigfileReceivedChunk,
  manifest: BigfileManifestTransfer,
): boolean => {
  const descriptor = manifest.chunks.find((candidate) => candidate.number === chunk.number);
  return Boolean(
    descriptor &&
      safeNumber(descriptor.offset) === chunk.offset &&
      safeNumber(descriptor.length) === chunk.length &&
      descriptor.blake3 === chunk.blake3,
  );
};

const assemble = (fields: CollectingFields): ReassemblyResult => {
  const manifest = fields.manifest;
  if (!manifest || fields.missingNumbers.length > 0) {
    return {
      kind: "ok",
      state: {
        ...fields,
        kind: "collecting",
        message: manifest
          ? `${fields.received.length}/${fields.chunkCount} verified chunks received.`
          : `${fields.received.length}/${fields.chunkCount} verified chunks received; manifest pending.`,
      },
    };
  }
  if (!fields.received.every((chunk) => chunkMatchesManifest(chunk, manifest))) {
    return fail(
      { ...fields, kind: "collecting", message: "Manifest conflict detected." },
      "A verified chunk conflicts with the manifest descriptors.",
      "Reset this transfer and scan a consistent sender session.",
    );
  }
  const bytes = new Uint8Array(fields.size);
  for (const chunk of fields.received) bytes.set(chunk.bytes, chunk.offset);
  if (digestHex(blake3(bytes)) !== manifest.file.blake3) {
    return fail(
      { kind: "collecting", ...fields, message: "Final BLAKE3 mismatch." },
      "The reassembled file does not match the manifest digest.",
      "Reject the transfer and rescan its chunks.",
    );
  }
  return {
    kind: "ok",
    state: {
      ...fields,
      kind: "complete",
      bytes,
      message: "All chunks and the final BLAKE3 digest are verified.",
    },
  };
};

const acceptManifest = (
  state: BigfileReassemblyState,
  transfer: BigfileManifestTransfer,
): ReassemblyResult => {
  const current = collectingFields(state) ?? stateFromTransfer(transfer);
  if (!current) {
    return fail(
      state,
      "The declared bigfile size exceeds this browser session policy.",
      `Use a transfer no larger than ${bigfileBrowserSessionLimit} bytes.`,
    );
  }
  if (!sameFile(current, transfer)) {
    return fail(
      state,
      "The manifest belongs to a different or conflicting transfer.",
      "Reset collection before scanning another transfer.",
    );
  }
  return assemble({ ...current, manifest: transfer });
};

const acceptChunk = (
  state: BigfileReassemblyState,
  transfer: BigfileChunkTransfer,
  payload: Uint8Array,
): ReassemblyResult => {
  const current = collectingFields(state) ?? stateFromTransfer(transfer);
  if (!current) {
    return fail(
      state,
      "The declared bigfile size exceeds this browser session policy.",
      `Use a transfer no larger than ${bigfileBrowserSessionLimit} bytes.`,
    );
  }
  if (!sameFile(current, transfer)) {
    return fail(
      state,
      "The chunk belongs to a different or conflicting transfer.",
      "Reset collection before scanning another transfer.",
    );
  }
  const offset = safeNumber(transfer.offset);
  const length = safeNumber(transfer.length);
  if (offset === null || length === null || length !== payload.byteLength) {
    return fail(state, "The verified chunk range cannot be represented safely.", "Reject it.");
  }
  const received = [
    ...current.received.filter((chunk) => chunk.number !== transfer.number),
    {
      number: transfer.number,
      offset,
      length,
      blake3: transfer.chunkBlake3,
      bytes: payload.slice(),
    },
  ].sort((left, right) => left.number - right.number);
  const missingNumbers = Array.from({ length: current.chunkCount }, (_, index) => index + 1).filter(
    (number) => !received.some((chunk) => chunk.number === number),
  );
  return assemble({ ...current, received, missingNumbers });
};

export function acceptDecodedBigfileEnvelope(
  state: BigfileReassemblyState,
  envelope: DecodedProtocolEnvelope,
): ReassemblyResult {
  switch (envelope.transfer.kind) {
    case "bigfileManifest":
      return acceptManifest(state, envelope.transfer);
    case "bigfileChunk":
      return acceptChunk(state, envelope.transfer, envelope.payload);
    case "direct":
      return fail(
        state,
        "A direct transfer cannot enter the bigfile collector.",
        "Handle it through the direct download path.",
      );
  }
}
