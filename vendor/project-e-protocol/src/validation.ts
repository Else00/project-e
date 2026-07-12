import type { TransferMetadata } from "../generated/typescript/project_e/transfer/v1/transfer_pb.js";
import type { ValidatedTransfer } from "./domain.ts";
import type { ValidationResult } from "./errors.ts";
import { validateBigfileChunk, validateManifest } from "./validation/bigfile.ts";
import { validateByteCount, validateContent } from "./validation/content.ts";
import { validateRequiredFeatures, validateTransferId } from "./validation/identity.ts";
import { failure, success } from "./validation/result.ts";

export const validateTransferMetadata = (
  input: TransferMetadata,
  payloadLength: bigint,
): ValidationResult<ValidatedTransfer> => {
  const safePayloadLength = validateByteCount(payloadLength);
  if (!safePayloadLength.ok) return safePayloadLength;
  const transferId = validateTransferId(input.transferId);
  if (!transferId.ok) return transferId;

  switch (input.body.case) {
    case "direct": {
      const features = validateRequiredFeatures(input.requiredFeatures, ["blake3Integrity"]);
      if (!features.ok) return features;
      const content = validateContent(input.body.value.content);
      if (!content.ok) return content;
      if (content.value.size !== payloadLength) {
        return failure({
          code: "contentSizeMismatch",
          declaredSize: content.value.size,
          payloadLength,
        });
      }
      return success(
        Object.freeze({
          kind: "direct",
          transferId: transferId.value,
          requiredFeatures: features.value,
          content: content.value,
        }),
      );
    }
    case "bigfileManifest": {
      const features = validateRequiredFeatures(input.requiredFeatures, [
        "blake3Integrity",
        "selfDescribingBigfileChunks",
      ]);
      if (!features.ok) return features;
      const manifest = validateManifest(input.body.value, payloadLength);
      if (!manifest.ok) return manifest;
      return success(
        Object.freeze({
          ...manifest.value,
          transferId: transferId.value,
          requiredFeatures: features.value,
        }),
      );
    }
    case "bigfileChunk": {
      const features = validateRequiredFeatures(input.requiredFeatures, [
        "blake3Integrity",
        "selfDescribingBigfileChunks",
      ]);
      if (!features.ok) return features;
      const chunk = validateBigfileChunk(input.body.value, payloadLength);
      if (!chunk.ok) return chunk;
      return success(
        Object.freeze({
          ...chunk.value,
          transferId: transferId.value,
          requiredFeatures: features.value,
        }),
      );
    }
    default:
      return failure({ code: "missingBody" });
  }
};
