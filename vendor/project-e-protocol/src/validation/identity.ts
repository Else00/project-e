import { RequiredFeature } from "../../generated/typescript/project_e/transfer/v1/transfer_pb.js";
import type { ChunkCount, ChunkNumber, DomainRequiredFeature, TransferId } from "../domain.ts";
import type { RequiredFeatureName, ValidationResult } from "../errors.ts";
import { failure, success } from "./result.ts";

const transferIdByteLength = 16;
const requiredFeatureCountMaximum = 32;

const toHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const validateTransferId = (value: Uint8Array): ValidationResult<TransferId> => {
  if (value.byteLength !== transferIdByteLength) {
    return failure({ code: "invalidTransferId", actualLength: value.byteLength });
  }
  return success(toHex(value) as TransferId);
};

export const validateRequiredFeatures = (
  values: readonly RequiredFeature[],
  required: readonly RequiredFeatureName[],
): ValidationResult<readonly DomainRequiredFeature[]> => {
  if (values.length > requiredFeatureCountMaximum) {
    return failure({ code: "tooManyRequiredFeatures", actualCount: values.length });
  }
  const seen = new Set<number>();
  const domain: DomainRequiredFeature[] = [];
  for (const feature of values) {
    if (seen.has(feature)) return failure({ code: "duplicateRequiredFeature", feature });
    seen.add(feature);
    switch (feature) {
      case RequiredFeature.BLAKE3_INTEGRITY:
        domain.push("blake3Integrity");
        break;
      case RequiredFeature.SELF_DESCRIBING_BIGFILE_CHUNKS:
        domain.push("selfDescribingBigfileChunks");
        break;
      default:
        return failure({ code: "unsupportedRequiredFeature", feature });
    }
  }
  for (const feature of required) {
    if (!domain.includes(feature)) {
      return failure({ code: "missingRequiredFeature", feature });
    }
  }
  return success(Object.freeze(domain));
};

export const validateChunkCount = (value: number): ValidationResult<ChunkCount> => {
  if (!Number.isInteger(value) || value < 1 || value > 0xffff_ffff) {
    return failure({ code: "invalidChunkCount", chunkCount: value });
  }
  return success(value as ChunkCount);
};

export const validateChunkNumber = (
  value: number,
  count: ChunkCount,
): ValidationResult<ChunkNumber> => {
  if (!Number.isInteger(value) || value < 1 || value > count) {
    return failure({ code: "invalidChunkNumber", number: value, chunkCount: count });
  }
  return success(value as ChunkNumber);
};
