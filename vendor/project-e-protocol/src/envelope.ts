import { create, toBinary } from "@bufbuild/protobuf";
import { blake3 } from "@noble/hashes/blake3.js";
import {
  BigfileChunkSchema,
  BigfileManifestSchema,
  ChunkDescriptorSchema,
} from "../generated/typescript/project_e/transfer/v1/bigfile_pb.js";
import {
  ContentDescriptorSchema,
  ContentKind,
} from "../generated/typescript/project_e/transfer/v1/content_pb.js";
import {
  DirectSchema,
  RequiredFeature,
  TransferMetadataSchema,
  type TransferMetadata,
} from "../generated/typescript/project_e/transfer/v1/transfer_pb.js";
import { decodeAndValidateMetadata } from "./codec.ts";
import type { DomainContentKind, ValidatedTransfer } from "./domain.ts";
import type { DigestField, ValidationError } from "./errors.ts";
import {
  type ParsedEnvelope,
  type PreludeError,
  type PreludeHeader,
  type PreludePolicy,
  parseEnvelope,
  writePrelude,
} from "./prelude.ts";

export type ProtocolContentHints = Readonly<{
  fileName?: string;
  mediaType?: string;
  kind: DomainContentKind;
}>;

export type ProtocolFileContent = ProtocolContentHints &
  Readonly<{
    size: bigint;
    blake3: Uint8Array;
  }>;

export type DirectEnvelopeRequest = Readonly<{
  transferId: Uint8Array;
  payload: Uint8Array;
  content: ProtocolContentHints;
}>;

export type ProtocolChunkDescriptorInput = Readonly<{
  number: number;
  offset: bigint;
  length: bigint;
  blake3: Uint8Array;
}>;

export type BigfileManifestEnvelopeRequest = Readonly<{
  transferId: Uint8Array;
  file: ProtocolFileContent;
  chunkCount: number;
  nominalChunkSize: bigint;
  chunks: readonly ProtocolChunkDescriptorInput[];
}>;

export type BigfileChunkEnvelopeRequest = Readonly<{
  transferId: Uint8Array;
  file: ProtocolFileContent;
  number: number;
  chunkCount: number;
  offset: bigint;
  payload: Uint8Array;
}>;

export type ProtocolEnvelopeError =
  | PreludeError
  | ValidationError
  | Readonly<{ code: "payloadHashMismatch"; field: DigestField }>;

export type ProtocolEnvelopeResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: ProtocolEnvelopeError }>;

export type EncodedProtocolEnvelope = Readonly<{
  bytes: Uint8Array;
  transfer: ValidatedTransfer;
}>;

export type DecodedProtocolEnvelope = Readonly<{
  header: PreludeHeader;
  transfer: ValidatedTransfer;
  payload: Uint8Array;
}>;

const success = <Value>(value: Value): ProtocolEnvelopeResult<Value> => ({ ok: true, value });

const failure = (error: ProtocolEnvelopeError): ProtocolEnvelopeResult<never> => ({
  ok: false,
  error,
});

const contentKind = (kind: DomainContentKind): ContentKind => {
  switch (kind) {
    case "auto":
      return ContentKind.UNSPECIFIED;
    case "file":
      return ContentKind.FILE;
    case "textUtf8":
      return ContentKind.TEXT_UTF8;
    case "image":
      return ContentKind.IMAGE;
  }
};

const contentDescriptor = (input: ProtocolFileContent) =>
  create(ContentDescriptorSchema, {
    fileName: input.fileName ?? "",
    ...(input.mediaType === undefined ? {} : { mediaType: input.mediaType }),
    size: input.size,
    blake3: input.blake3,
    kind: contentKind(input.kind),
  });

const digestHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const digestMatches = (payload: Uint8Array, expectedHex: string): boolean =>
  digestHex(blake3(payload)) === expectedHex;

const concatenateEnvelope = (
  prelude: Uint8Array,
  metadata: Uint8Array,
  payload: Uint8Array,
): Uint8Array => {
  const bytes = new Uint8Array(prelude.byteLength + metadata.byteLength + payload.byteLength);
  bytes.set(prelude, 0);
  bytes.set(metadata, prelude.byteLength);
  bytes.set(payload, prelude.byteLength + metadata.byteLength);
  return bytes;
};

const encodeWireEnvelope = (
  wire: TransferMetadata,
  payload: Uint8Array,
  policy: PreludePolicy,
): ProtocolEnvelopeResult<EncodedProtocolEnvelope> => {
  const metadata = toBinary(TransferMetadataSchema, wire);
  const validated = decodeAndValidateMetadata(metadata, BigInt(payload.byteLength));
  if (!validated.ok) return failure(validated.error);
  const prelude = writePrelude(metadata, BigInt(payload.byteLength), policy);
  if (!prelude.ok) return failure(prelude.error);
  return success({
    bytes: concatenateEnvelope(prelude.value, metadata, payload),
    transfer: validated.value,
  });
};

export const encodeDirectEnvelope = (
  request: DirectEnvelopeRequest,
  policy: PreludePolicy,
): ProtocolEnvelopeResult<EncodedProtocolEnvelope> => {
  const content = contentDescriptor({
    ...request.content,
    size: BigInt(request.payload.byteLength),
    blake3: blake3(request.payload),
  });
  return encodeWireEnvelope(
    create(TransferMetadataSchema, {
      transferId: request.transferId,
      requiredFeatures: [RequiredFeature.BLAKE3_INTEGRITY],
      body: {
        case: "direct",
        value: create(DirectSchema, { content }),
      },
    }),
    request.payload,
    policy,
  );
};

export const encodeBigfileManifestEnvelope = (
  request: BigfileManifestEnvelopeRequest,
  policy: PreludePolicy,
): ProtocolEnvelopeResult<EncodedProtocolEnvelope> =>
  encodeWireEnvelope(
    create(TransferMetadataSchema, {
      transferId: request.transferId,
      requiredFeatures: [
        RequiredFeature.BLAKE3_INTEGRITY,
        RequiredFeature.SELF_DESCRIBING_BIGFILE_CHUNKS,
      ],
      body: {
        case: "bigfileManifest",
        value: create(BigfileManifestSchema, {
          file: contentDescriptor(request.file),
          chunkCount: request.chunkCount,
          nominalChunkSize: request.nominalChunkSize,
          chunks: request.chunks.map((chunk) => create(ChunkDescriptorSchema, chunk)),
        }),
      },
    }),
    new Uint8Array(),
    policy,
  );

export const encodeBigfileChunkEnvelope = (
  request: BigfileChunkEnvelopeRequest,
  policy: PreludePolicy,
): ProtocolEnvelopeResult<EncodedProtocolEnvelope> =>
  encodeWireEnvelope(
    create(TransferMetadataSchema, {
      transferId: request.transferId,
      requiredFeatures: [
        RequiredFeature.BLAKE3_INTEGRITY,
        RequiredFeature.SELF_DESCRIBING_BIGFILE_CHUNKS,
      ],
      body: {
        case: "bigfileChunk",
        value: create(BigfileChunkSchema, {
          file: contentDescriptor(request.file),
          number: request.number,
          chunkCount: request.chunkCount,
          offset: request.offset,
          length: BigInt(request.payload.byteLength),
          chunkBlake3: blake3(request.payload),
        }),
      },
    }),
    request.payload,
    policy,
  );

const payloadFromEnvelope = (bytes: Uint8Array, parsed: ParsedEnvelope): Uint8Array =>
  bytes.slice(parsed.payloadRange.offset, parsed.payloadRange.offset + parsed.payloadRange.length);

export const decodeProtocolEnvelope = (
  bytes: Uint8Array,
  policy: PreludePolicy,
): ProtocolEnvelopeResult<DecodedProtocolEnvelope> => {
  const parsed = parseEnvelope(bytes, policy);
  if (!parsed.ok) return failure(parsed.error);
  const validated = decodeAndValidateMetadata(
    parsed.value.metadata,
    parsed.value.header.payloadLength,
  );
  if (!validated.ok) return failure(validated.error);
  const payload = payloadFromEnvelope(bytes, parsed.value);

  switch (validated.value.kind) {
    case "direct":
      if (!digestMatches(payload, validated.value.content.blake3)) {
        return failure({ code: "payloadHashMismatch", field: "content" });
      }
      break;
    case "bigfileChunk":
      if (!digestMatches(payload, validated.value.chunkBlake3)) {
        return failure({ code: "payloadHashMismatch", field: "chunk" });
      }
      break;
    case "bigfileManifest":
      break;
  }

  return success({
    header: parsed.value.header,
    transfer: validated.value,
    payload,
  });
};
