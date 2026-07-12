import { blake3 } from "@noble/hashes/blake3.js";
import { protocolVersion } from "./version.ts";

export const preludeByteLength = 60;
export const metadataByteLengthMinimum = 1;
export const metadataByteLengthMaximum = 1_048_576;
export const payloadByteLengthMaximum = BigInt(Number.MAX_SAFE_INTEGER);

const metadataDigestOffset = 28;
const metadataDigestByteLength = 32;
const supportedFlags = 0;
const magic = Uint8Array.of(0x50, 0x4a, 0x45, 0x54, 0x52, 0x41, 0x4e, 0x53);
const policyBrand: unique symbol = Symbol("PreludePolicy");

export type PreludePolicy = Readonly<{
  maxPayloadBytes: bigint;
  [policyBrand]: true;
}>;

export type PreludePolicyError =
  | Readonly<{ code: "invalidPolicy"; reason: "notBigInt" }>
  | Readonly<{
      code: "invalidPolicy";
      reason: "outOfRange";
      maxPayloadBytes: bigint;
    }>;

export type PreludeHeader = Readonly<{
  major: number;
  minor: number;
  flags: number;
  metadataLength: number;
  payloadLength: bigint;
  metadataBlake3: Uint8Array;
}>;

export type ParsedEnvelope = Readonly<{
  header: PreludeHeader;
  metadata: Uint8Array;
  payloadRange: Readonly<{
    offset: number;
    length: number;
  }>;
}>;

export type PreludeError =
  | Readonly<{ code: "truncatedPrelude"; availableBytes: number }>
  | Readonly<{ code: "invalidMagic" }>
  | Readonly<{ code: "unsupportedMajor"; major: number }>
  | Readonly<{ code: "unsupportedFlags"; flags: number }>
  | Readonly<{ code: "metadataLengthOutOfRange"; metadataLength: number }>
  | Readonly<{ code: "payloadLengthOutOfRange"; payloadLength: bigint }>
  | Readonly<{
      code: "payloadLimitExceeded";
      payloadLength: bigint;
      maxPayloadBytes: bigint;
    }>
  | Readonly<{
      code: "declaredLengthMismatch";
      declaredLength: bigint;
      availableLength: number;
    }>
  | Readonly<{ code: "metadataHashMismatch" }>;

export type ProtocolResult<Value, Error = PreludeError> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Error }>;

const success = <Value>(value: Value): Readonly<{ ok: true; value: Value }> => ({
  ok: true,
  value,
});

const failure = <Error>(error: Error): Readonly<{ ok: false; error: Error }> => ({
  ok: false,
  error,
});

export const createPreludePolicy = (
  maxPayloadBytes: unknown,
): ProtocolResult<PreludePolicy, PreludePolicyError> => {
  if (typeof maxPayloadBytes !== "bigint") {
    return failure({ code: "invalidPolicy", reason: "notBigInt" });
  }
  if (maxPayloadBytes < 0n || maxPayloadBytes > payloadByteLengthMaximum) {
    return failure({ code: "invalidPolicy", reason: "outOfRange", maxPayloadBytes });
  }
  return success(
    Object.freeze({ maxPayloadBytes, [policyBrand]: true } as const satisfies PreludePolicy),
  );
};

const validatePayloadLength = (
  payloadLength: bigint,
  policy: PreludePolicy,
): PreludeError | undefined => {
  if (payloadLength < 0n || payloadLength > payloadByteLengthMaximum) {
    return { code: "payloadLengthOutOfRange", payloadLength };
  }
  if (payloadLength > policy.maxPayloadBytes) {
    return {
      code: "payloadLimitExceeded",
      payloadLength,
      maxPayloadBytes: policy.maxPayloadBytes,
    };
  }
  return undefined;
};

const digestMatches = (actual: Uint8Array, expected: Uint8Array): boolean => {
  let difference = actual.byteLength ^ expected.byteLength;
  for (let index = 0; index < expected.byteLength; index += 1) {
    difference |= (actual[index] as number) ^ (expected[index] as number);
  }
  return difference === 0;
};

export const writePrelude = (
  metadata: Uint8Array,
  payloadLength: bigint,
  policy: PreludePolicy,
): ProtocolResult<Uint8Array> => {
  if (
    metadata.byteLength < metadataByteLengthMinimum ||
    metadata.byteLength > metadataByteLengthMaximum
  ) {
    return failure({
      code: "metadataLengthOutOfRange",
      metadataLength: metadata.byteLength,
    });
  }

  const payloadError = validatePayloadLength(payloadLength, policy);
  if (payloadError !== undefined) {
    return failure(payloadError);
  }

  const bytes = new Uint8Array(preludeByteLength);
  bytes.set(magic, 0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(8, protocolVersion.major);
  view.setUint16(10, protocolVersion.minor);
  view.setUint32(12, supportedFlags);
  view.setUint32(16, metadata.byteLength);
  view.setBigUint64(20, payloadLength);
  bytes.set(blake3(metadata), metadataDigestOffset);
  return success(bytes);
};

export const parseEnvelope = (
  bytes: Uint8Array,
  policy: PreludePolicy,
): ProtocolResult<ParsedEnvelope> => {
  if (bytes.byteLength < preludeByteLength) {
    return failure({ code: "truncatedPrelude", availableBytes: bytes.byteLength });
  }

  if (!digestMatches(bytes.subarray(0, magic.byteLength), magic)) {
    return failure({ code: "invalidMagic" });
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, preludeByteLength);
  const major = view.getUint16(8);
  if (major !== protocolVersion.major) {
    return failure({ code: "unsupportedMajor", major });
  }

  const minor = view.getUint16(10);
  const flags = view.getUint32(12);
  if (flags !== supportedFlags) {
    return failure({ code: "unsupportedFlags", flags });
  }

  const metadataLength = view.getUint32(16);
  if (metadataLength < metadataByteLengthMinimum || metadataLength > metadataByteLengthMaximum) {
    return failure({ code: "metadataLengthOutOfRange", metadataLength });
  }

  const payloadLength = view.getBigUint64(20);
  const payloadError = validatePayloadLength(payloadLength, policy);
  if (payloadError !== undefined) {
    return failure(payloadError);
  }

  const declaredLength = BigInt(preludeByteLength + metadataLength) + payloadLength;
  if (declaredLength !== BigInt(bytes.byteLength)) {
    return failure({
      code: "declaredLengthMismatch",
      declaredLength,
      availableLength: bytes.byteLength,
    });
  }

  const metadataEnd = preludeByteLength + metadataLength;
  const metadata = bytes.slice(preludeByteLength, metadataEnd);
  const metadataBlake3 = bytes.slice(
    metadataDigestOffset,
    metadataDigestOffset + metadataDigestByteLength,
  );
  if (!digestMatches(blake3(metadata), metadataBlake3)) {
    return failure({ code: "metadataHashMismatch" });
  }

  return success({
    header: {
      major,
      minor,
      flags,
      metadataLength,
      payloadLength,
      metadataBlake3,
    },
    metadata,
    payloadRange: {
      offset: metadataEnd,
      length: Number(payloadLength),
    },
  });
};
