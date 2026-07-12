import {
  type ContentDescriptor,
  ContentKind,
} from "../../generated/typescript/project_e/transfer/v1/content_pb.js";
import type {
  Blake3Digest,
  ByteCount,
  DomainContent,
  DomainContentKind,
  MediaType,
  SafeFileName,
} from "../domain.ts";
import type { ValidationResult } from "../errors.ts";
import { payloadByteLengthMaximum } from "../prelude.ts";
import { failure, success } from "./result.ts";

const digestByteLength = 32;
const fileNameByteLengthMaximum = 255;
const mediaTypeByteLengthMaximum = 127;
const textEncoder = new TextEncoder();
const unsafeFilenameCharacter = /[\p{Cc}\p{Cf}]/u;
const drivePrefix = /^[A-Za-z]:/;
const mediaTypeSyntax =
  /^[A-Za-z0-9!#$%&'*+.^_`|~-]+\/[A-Za-z0-9!#$%&'*+.^_`|~-]+(?:;[ \t]*[A-Za-z0-9!#$%&'*+.^_`|~-]+=(?:[A-Za-z0-9!#$%&'*+.^_`|~-]+|"[\u0020-\u0021\u0023-\u005b\u005d-\u007e]*"))*$/;

const hasValidUnicode = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const validateFileName = (value: string): ValidationResult<SafeFileName | undefined> => {
  if (value.length === 0) return success(undefined);
  if (!hasValidUnicode(value)) {
    return failure({ code: "invalidFileName", reason: "invalidUnicode" });
  }
  if (textEncoder.encode(value).byteLength > fileNameByteLengthMaximum) {
    return failure({ code: "invalidFileName", reason: "tooLong" });
  }
  if (unsafeFilenameCharacter.test(value)) {
    return failure({ code: "invalidFileName", reason: "control" });
  }
  if (
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    drivePrefix.test(value)
  ) {
    return failure({ code: "invalidFileName", reason: "path" });
  }
  return success(value as SafeFileName);
};

const validateMediaType = (value: string): ValidationResult<MediaType> => {
  if (value.length === 0) return failure({ code: "invalidMimeType", reason: "empty" });
  if (textEncoder.encode(value).byteLength > mediaTypeByteLengthMaximum) {
    return failure({ code: "invalidMimeType", reason: "tooLong" });
  }
  if (!mediaTypeSyntax.test(value)) {
    return failure({ code: "invalidMimeType", reason: "syntax" });
  }
  return success(value as MediaType);
};

export const validateByteCount = (value: bigint): ValidationResult<ByteCount> => {
  if (value < 0n || value > payloadByteLengthMaximum) {
    return failure({ code: "payloadLengthOutOfRange", payloadLength: value });
  }
  return success(value as ByteCount);
};

const toHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const digestHex = (
  value: Uint8Array,
  field: "content" | "chunk",
): ValidationResult<Blake3Digest> => {
  if (value.byteLength !== digestByteLength) {
    return failure({ code: "invalidDigestLength", field, actualLength: value.byteLength });
  }
  return success(toHex(value) as Blake3Digest);
};

const contentKind = (kind: ContentKind): ValidationResult<DomainContentKind> => {
  switch (kind) {
    case ContentKind.UNSPECIFIED:
      return success("auto");
    case ContentKind.FILE:
      return success("file");
    case ContentKind.TEXT_UTF8:
      return success("textUtf8");
    case ContentKind.IMAGE:
      return success("image");
    default:
      return failure({ code: "invalidContentKind", kind });
  }
};

export const validateContent = (
  input: ContentDescriptor | undefined,
): ValidationResult<DomainContent> => {
  if (input === undefined) return failure({ code: "missingContent" });
  const fileName = validateFileName(input.fileName);
  if (!fileName.ok) return fileName;
  const mediaType = input.mediaType === undefined ? undefined : validateMediaType(input.mediaType);
  if (mediaType !== undefined && !mediaType.ok) return mediaType;
  const size = validateByteCount(input.size);
  if (!size.ok) return size;
  const digest = digestHex(input.blake3, "content");
  if (!digest.ok) return digest;
  const kind = contentKind(input.kind);
  if (!kind.ok) return kind;

  const base = {
    size: size.value,
    blake3: digest.value,
    kind: kind.value,
  };
  return success(
    Object.freeze({
      ...base,
      ...(fileName.value === undefined ? {} : { fileName: fileName.value }),
      ...(mediaType === undefined ? {} : { mediaType: mediaType.value }),
    }),
  );
};
