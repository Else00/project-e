declare const transferIdBrand: unique symbol;
declare const blake3DigestBrand: unique symbol;
declare const byteCountBrand: unique symbol;
declare const safeFileNameBrand: unique symbol;
declare const mediaTypeBrand: unique symbol;
declare const chunkNumberBrand: unique symbol;
declare const chunkCountBrand: unique symbol;

export type TransferId = string & { readonly [transferIdBrand]: true };
export type Blake3Digest = string & { readonly [blake3DigestBrand]: true };
export type ByteCount = bigint & { readonly [byteCountBrand]: true };
export type SafeFileName = string & { readonly [safeFileNameBrand]: true };
export type MediaType = string & { readonly [mediaTypeBrand]: true };
export type ChunkNumber = number & { readonly [chunkNumberBrand]: true };
export type ChunkCount = number & { readonly [chunkCountBrand]: true };

export type DomainContentKind = "auto" | "file" | "textUtf8" | "image";
export type DomainRequiredFeature = "blake3Integrity" | "selfDescribingBigfileChunks";

export type DomainContent = Readonly<{
  fileName?: SafeFileName;
  mediaType?: MediaType;
  size: ByteCount;
  blake3: Blake3Digest;
  kind: DomainContentKind;
}>;

export type DomainChunkDescriptor = Readonly<{
  number: ChunkNumber;
  offset: ByteCount;
  length: ByteCount;
  blake3: Blake3Digest;
}>;

type TransferIdentity = Readonly<{
  transferId: TransferId;
  requiredFeatures: readonly DomainRequiredFeature[];
}>;

export type DirectTransfer = TransferIdentity &
  Readonly<{
    kind: "direct";
    content: DomainContent;
  }>;

export type BigfileManifestTransfer = TransferIdentity &
  Readonly<{
    kind: "bigfileManifest";
    file: DomainContent;
    chunkCount: ChunkCount;
    nominalChunkSize: ByteCount;
    chunks: readonly DomainChunkDescriptor[];
  }>;

export type BigfileChunkTransfer = TransferIdentity &
  Readonly<{
    kind: "bigfileChunk";
    file: DomainContent;
    number: ChunkNumber;
    chunkCount: ChunkCount;
    offset: ByteCount;
    length: ByteCount;
    chunkBlake3: Blake3Digest;
  }>;

export type ValidatedTransfer = DirectTransfer | BigfileManifestTransfer | BigfileChunkTransfer;
