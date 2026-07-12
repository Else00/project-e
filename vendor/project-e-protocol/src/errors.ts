export type DigestField = "content" | "chunk";
export type RequiredFeatureName = "blake3Integrity" | "selfDescribingBigfileChunks";

export type ValidationError =
  | Readonly<{ code: "metadataLengthOutOfRange"; metadataLength: number }>
  | Readonly<{ code: "payloadLengthOutOfRange"; payloadLength: bigint }>
  | Readonly<{ code: "invalidProtobuf" }>
  | Readonly<{ code: "invalidTransferId"; actualLength: number }>
  | Readonly<{ code: "tooManyRequiredFeatures"; actualCount: number }>
  | Readonly<{ code: "unsupportedRequiredFeature"; feature: number }>
  | Readonly<{ code: "duplicateRequiredFeature"; feature: number }>
  | Readonly<{ code: "missingRequiredFeature"; feature: RequiredFeatureName }>
  | Readonly<{ code: "missingBody" }>
  | Readonly<{ code: "missingContent" }>
  | Readonly<{
      code: "invalidFileName";
      reason: "invalidUnicode" | "tooLong" | "control" | "path";
    }>
  | Readonly<{ code: "invalidMimeType"; reason: "empty" | "tooLong" | "syntax" }>
  | Readonly<{ code: "invalidContentKind"; kind: number }>
  | Readonly<{ code: "invalidDigestLength"; field: DigestField; actualLength: number }>
  | Readonly<{
      code: "contentSizeMismatch";
      declaredSize: bigint;
      payloadLength: bigint;
    }>
  | Readonly<{ code: "manifestPayloadNotEmpty"; payloadLength: bigint }>
  | Readonly<{ code: "invalidChunkCount"; chunkCount: number; descriptorCount?: number }>
  | Readonly<{ code: "invalidNominalChunkSize"; nominalChunkSize: bigint }>
  | Readonly<{
      code: "invalidChunkNumber";
      number: number;
      chunkCount: number;
    }>
  | Readonly<{
      code: "invalidChunkRange";
      number: number;
      offset: bigint;
      length: bigint;
      fileSize: bigint;
    }>
  | Readonly<{
      code: "chunkPayloadLengthMismatch";
      chunkLength: bigint;
      payloadLength: bigint;
    }>;

export type ValidationResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: ValidationError }>;
