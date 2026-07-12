import { fromBinary } from "@bufbuild/protobuf";
import { TransferMetadataSchema } from "../generated/typescript/project_e/transfer/v1/transfer_pb.js";
import type { ValidatedTransfer } from "./domain.ts";
import type { ValidationResult } from "./errors.ts";
import { metadataByteLengthMaximum, metadataByteLengthMinimum } from "./prelude.ts";
import { validateTransferMetadata } from "./validation.ts";

export const decodeAndValidateMetadata = (
  metadata: Uint8Array,
  payloadLength: bigint,
): ValidationResult<ValidatedTransfer> => {
  if (
    metadata.byteLength < metadataByteLengthMinimum ||
    metadata.byteLength > metadataByteLengthMaximum
  ) {
    return {
      ok: false,
      error: { code: "metadataLengthOutOfRange", metadataLength: metadata.byteLength },
    };
  }
  try {
    return validateTransferMetadata(fromBinary(TransferMetadataSchema, metadata), payloadLength);
  } catch {
    return { ok: false, error: { code: "invalidProtobuf" } };
  }
};
