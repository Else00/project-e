import type {
  BigfileChunk,
  BigfileManifest,
  ChunkDescriptor,
} from "../../generated/typescript/project_e/transfer/v1/bigfile_pb.js";
import type { ByteCount, DomainChunkDescriptor, ValidatedTransfer } from "../domain.ts";
import type { ValidationResult } from "../errors.ts";
import { digestHex, validateByteCount, validateContent } from "./content.ts";
import { validateChunkCount, validateChunkNumber } from "./identity.ts";
import { failure, success } from "./result.ts";

const invalidRange = (
  number: number,
  offset: bigint,
  length: bigint,
  fileSize: bigint,
): ValidationResult<never> =>
  failure({ code: "invalidChunkRange", number, offset, length, fileSize });

const validateManifestChunk = (
  input: ChunkDescriptor,
  expectedNumber: number,
  chunkCount: Parameters<typeof validateChunkNumber>[1],
  expectedOffset: bigint,
  fileSize: ByteCount,
): ValidationResult<DomainChunkDescriptor> => {
  const number = validateChunkNumber(input.number, chunkCount);
  if (!number.ok) return number;
  if (input.number !== expectedNumber) {
    return failure({ code: "invalidChunkNumber", number: input.number, chunkCount });
  }
  const offset = validateByteCount(input.offset);
  if (!offset.ok) return offset;
  const length = validateByteCount(input.length);
  if (!length.ok) return length;
  const end = input.offset + input.length;
  if (input.offset !== expectedOffset || input.length === 0n || end > fileSize) {
    return invalidRange(input.number, input.offset, input.length, fileSize);
  }
  const digest = digestHex(input.blake3, "chunk");
  if (!digest.ok) return digest;
  return success(
    Object.freeze({
      number: number.value,
      offset: offset.value,
      length: length.value,
      blake3: digest.value,
    }),
  );
};

export const validateManifest = (
  input: BigfileManifest,
  payloadLength: bigint,
): ValidationResult<
  Omit<ValidatedTransfer & { kind: "bigfileManifest" }, "transferId" | "requiredFeatures">
> => {
  if (payloadLength !== 0n) {
    return failure({ code: "manifestPayloadNotEmpty", payloadLength });
  }
  const file = validateContent(input.file);
  if (!file.ok) return file;
  const chunkCount = validateChunkCount(input.chunkCount);
  if (!chunkCount.ok) return chunkCount;
  if (input.chunks.length !== input.chunkCount) {
    return failure({
      code: "invalidChunkCount",
      chunkCount: input.chunkCount,
      descriptorCount: input.chunks.length,
    });
  }
  const nominalChunkSize = validateByteCount(input.nominalChunkSize);
  if (!nominalChunkSize.ok || input.nominalChunkSize === 0n) {
    return failure({
      code: "invalidNominalChunkSize",
      nominalChunkSize: input.nominalChunkSize,
    });
  }

  const chunks: DomainChunkDescriptor[] = [];
  let expectedOffset = 0n;
  for (const [index, chunk] of input.chunks.entries()) {
    const validated = validateManifestChunk(
      chunk,
      index + 1,
      chunkCount.value,
      expectedOffset,
      file.value.size,
    );
    if (!validated.ok) return validated;
    chunks.push(validated.value);
    expectedOffset += validated.value.length;
  }
  if (expectedOffset !== file.value.size) {
    const last = input.chunks.at(-1) as ChunkDescriptor;
    return invalidRange(last.number, last.offset, last.length, file.value.size);
  }
  return success(
    Object.freeze({
      kind: "bigfileManifest",
      file: file.value,
      chunkCount: chunkCount.value,
      nominalChunkSize: nominalChunkSize.value,
      chunks: Object.freeze(chunks),
    }),
  );
};

export const validateBigfileChunk = (
  input: BigfileChunk,
  payloadLength: bigint,
): ValidationResult<
  Omit<ValidatedTransfer & { kind: "bigfileChunk" }, "transferId" | "requiredFeatures">
> => {
  const file = validateContent(input.file);
  if (!file.ok) return file;
  const chunkCount = validateChunkCount(input.chunkCount);
  if (!chunkCount.ok) return chunkCount;
  const number = validateChunkNumber(input.number, chunkCount.value);
  if (!number.ok) return number;
  const offset = validateByteCount(input.offset);
  if (!offset.ok) return offset;
  const length = validateByteCount(input.length);
  if (!length.ok) return length;
  const end = input.offset + input.length;
  if (input.length === 0n || input.offset >= file.value.size || end > file.value.size) {
    return invalidRange(input.number, input.offset, input.length, file.value.size);
  }
  if (input.length !== payloadLength) {
    return failure({
      code: "chunkPayloadLengthMismatch",
      chunkLength: input.length,
      payloadLength,
    });
  }
  const digest = digestHex(input.chunkBlake3, "chunk");
  if (!digest.ok) return digest;
  return success(
    Object.freeze({
      kind: "bigfileChunk",
      file: file.value,
      number: number.value,
      chunkCount: chunkCount.value,
      offset: offset.value,
      length: length.value,
      chunkBlake3: digest.value,
    }),
  );
};
