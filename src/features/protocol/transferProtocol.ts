import {
  type BigfileChunkEnvelopeRequest,
  type BigfileManifestEnvelopeRequest,
  type DecodedProtocolEnvelope,
  type ProtocolFileContent,
  type ProtocolContentHints,
  type ProtocolEnvelopeError,
  type ProtocolEnvelopeResult,
  createPreludePolicy,
  decodeProtocolEnvelope,
  encodeBigfileChunkEnvelope,
  encodeBigfileManifestEnvelope,
  encodeDirectEnvelope,
} from "project-e-protocol";
import { blake3 } from "@noble/hashes/blake3.js";
import { bigfileBrowserSessionLimit } from "../bigfile/bigfilePlan";
import type { BigfilePlan } from "../bigfile/bigfilePlan";
import type { EncodeId } from "../../domain/scalars";

export type ProtocolProductErrorCode =
  | ProtocolEnvelopeError["code"]
  | "fileReadFailed"
  | "invalidBigfilePlan";

export type ProtocolProductError = Readonly<{
  code: ProtocolProductErrorCode;
  message: string;
  recovery: string;
}>;

export type ProtocolProductResult<Value> =
  | Readonly<{ kind: "ok"; value: Value }>
  | Readonly<{ kind: "err"; error: ProtocolProductError }>;

const policyResult = createPreludePolicy(BigInt(bigfileBrowserSessionLimit));
/* v8 ignore start -- the fixed browser limit is validated by the protocol package itself. */
if (!policyResult.ok) {
  throw new Error("The browser protocol payload policy is invalid.");
}
/* v8 ignore stop */
const browserProtocolPolicy = policyResult.value;

const readFileBytes = async (file: File): Promise<ProtocolProductResult<Uint8Array>> => {
  try {
    if (typeof file.arrayBuffer === "function") {
      return { kind: "ok", value: new Uint8Array(await file.arrayBuffer()) };
    }
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("FileReader failed."));
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error("FileReader did not produce bytes."));
      };
      reader.readAsArrayBuffer(file);
    });
    return { kind: "ok", value: new Uint8Array(buffer) };
  } catch {
    return {
      kind: "err",
      error: {
        code: "fileReadFailed",
        message: "The selected file could not be read locally.",
        recovery: "Select the file again and keep it available until encoding starts.",
      },
    };
  }
};

type RenderableBigfilePlan = Extract<BigfilePlan, { readonly kind: "planned" }>;

export type ProtocolBigfileStream = Readonly<{
  index: number;
  kind: "manifest" | "chunk";
  label: string;
  encodeId: EncodeId;
  file: File;
  chunkNumber?: number;
}>;

export type PreparedProtocolBigfile = Readonly<{
  transferId: Uint8Array;
  streams: readonly ProtocolBigfileStream[];
}>;

const contentHints = (file: File): ProtocolContentHints => ({
  fileName: file.name,
  ...(file.type ? { mediaType: file.type } : {}),
  kind: file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("text/")
      ? "textUtf8"
      : "file",
});

export function createTransferId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function protocolError(error: ProtocolEnvelopeError): ProtocolProductError {
  switch (error.code) {
    case "invalidMagic":
      return {
        code: error.code,
        message: "The decoded bytes are not a Project E transfer.",
        recovery: "Scan a frame produced by a compatible project-e.transfer sender.",
      };
    case "unsupportedMajor":
      return {
        code: error.code,
        message: `Protocol wire major ${error.major} is unsupported.`,
        recovery: "Use sender and receiver builds that support the same wire major.",
      };
    case "payloadHashMismatch":
    case "metadataHashMismatch":
      return {
        code: error.code,
        message: "BLAKE3 integrity verification failed.",
        recovery: "Reject these bytes and scan the transfer again.",
      };
    default:
      return {
        code: error.code,
        message: `Protocol validation failed: ${error.code}.`,
        recovery: "Reject these bytes and retry with a compatible sender.",
      };
  }
}

function mapResult<Value>(result: ProtocolEnvelopeResult<Value>): ProtocolProductResult<Value> {
  return result.ok
    ? { kind: "ok", value: result.value }
    : { kind: "err", error: protocolError(result.error) };
}

export async function encodeDirectFile(
  file: File,
  transferId: Uint8Array = createTransferId(),
): Promise<ProtocolProductResult<File>> {
  const read = await readFileBytes(file);
  if (read.kind === "err") return read;
  const payload = read.value;
  const result = mapResult(
    encodeDirectEnvelope(
      {
        transferId,
        payload,
        content: contentHints(file),
      },
      browserProtocolPolicy,
    ),
  );
  if (result.kind === "err") return result;
  return {
    kind: "ok",
    value: new File([new Uint8Array(result.value.bytes).buffer], file.name, {
      type: "application/vnd.project-e.transfer",
      lastModified: file.lastModified,
    }),
  };
}

export function decodeTransfer(bytes: Uint8Array): ProtocolProductResult<DecodedProtocolEnvelope> {
  return mapResult(decodeProtocolEnvelope(bytes, browserProtocolPolicy));
}

const envelopeFile = (bytes: Uint8Array, name: string, lastModified: number): File =>
  new File([new Uint8Array(bytes).buffer], name, {
    type: "application/vnd.project-e.transfer",
    lastModified,
  });

export async function prepareBigfileTransfer(
  file: File,
  plan: RenderableBigfilePlan,
  transferId: Uint8Array = createTransferId(),
): Promise<ProtocolProductResult<PreparedProtocolBigfile>> {
  const read = await readFileBytes(file);
  if (read.kind === "err") return read;
  const source = read.value;
  const firstChunk = plan.chunks[0];
  if (!firstChunk) {
    return {
      kind: "err",
      error: {
        code: "invalidBigfilePlan",
        message: "The bigfile plan contains no chunk streams.",
        recovery: "Select the source file again to rebuild its transfer plan.",
      },
    };
  }
  const fileContent: ProtocolFileContent = {
    ...contentHints(file),
    size: BigInt(source.byteLength),
    blake3: blake3(source),
  };
  const chunkInputs = plan.chunks.map((chunk) => {
    const payload = source.slice(chunk.start, chunk.end);
    return {
      descriptor: {
        number: chunk.index + 1,
        offset: BigInt(chunk.start),
        length: BigInt(payload.byteLength),
        blake3: blake3(payload),
      },
      payload,
      chunk,
    };
  });
  const manifestRequest: BigfileManifestEnvelopeRequest = {
    transferId,
    file: fileContent,
    chunkCount: plan.chunkCount,
    nominalChunkSize: BigInt(plan.chunkBytes),
    chunks: chunkInputs.map((chunk) => chunk.descriptor),
  };
  const manifest = mapResult(encodeBigfileManifestEnvelope(manifestRequest, browserProtocolPolicy));
  if (manifest.kind === "err") return manifest;

  const streams: ProtocolBigfileStream[] = [
    {
      index: 0,
      kind: "manifest",
      label: `${plan.fileName} · manifest`,
      encodeId: ((firstChunk.encodeId - 1) & 0xffff) as EncodeId,
      file: envelopeFile(manifest.value.bytes, `${plan.fileName}.manifest.pje`, file.lastModified),
    },
  ];
  for (const input of chunkInputs) {
    const request: BigfileChunkEnvelopeRequest = {
      transferId,
      file: fileContent,
      number: input.descriptor.number,
      chunkCount: plan.chunkCount,
      offset: input.descriptor.offset,
      payload: input.payload,
    };
    const encoded = mapResult(encodeBigfileChunkEnvelope(request, browserProtocolPolicy));
    /* v8 ignore start -- the validated manifest and shared inputs guarantee this request's invariants. */
    if (encoded.kind === "err") return encoded;
    /* v8 ignore stop */
    streams.push({
      index: input.chunk.index + 1,
      kind: "chunk",
      label: `${plan.fileName} · chunk ${input.chunk.index + 1}/${plan.chunkCount}`,
      encodeId: input.chunk.encodeId,
      chunkNumber: input.chunk.index + 1,
      file: envelopeFile(
        encoded.value.bytes,
        `${plan.fileName}.chunk-${String(input.chunk.index + 1).padStart(4, "0")}.pje`,
        file.lastModified,
      ),
    });
  }
  return { kind: "ok", value: { transferId, streams } };
}
