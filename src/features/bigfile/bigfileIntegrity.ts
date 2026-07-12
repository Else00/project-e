import { blake3 as nobleBlake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createBLAKE3 } from "hash-wasm";

export type HashAlgorithm = "BLAKE3";

export type Blake3Value = string & { readonly __brand: "Blake3Value" };

export type IntegrityHash = Readonly<{
  algorithm: HashAlgorithm;
  value: Blake3Value;
  engine: "wasm" | "js";
}>;

export type Blake3Result =
  | Readonly<{ kind: "ok"; hash: IntegrityHash }>
  | Readonly<{ kind: "err"; message: string; recovery: string }>;

const blake3Pattern = /^[a-f0-9]{64}$/u;

export function normalizeBlake3(
  value: unknown,
  engine: IntegrityHash["engine"] = "js",
): Blake3Result {
  if (typeof value !== "string") {
    return {
      kind: "err",
      message: "BLAKE3 must be a string.",
      recovery: "Regenerate the manifest with a compatible sender.",
    };
  }
  const normalized = value.trim().toLowerCase();
  if (!blake3Pattern.test(normalized)) {
    return {
      kind: "err",
      message: "BLAKE3 must be 64 hexadecimal characters.",
      recovery: "Use the original manifest or regenerate it from the source file.",
    };
  }
  return {
    kind: "ok",
    hash: { algorithm: "BLAKE3", value: normalized as Blake3Value, engine },
  };
}

export function normalizeIntegrityHash(value: unknown): Blake3Result {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      kind: "err",
      message: "Integrity hash must be a BLAKE3 object with algorithm and value.",
      recovery: "Regenerate the manifest with a compatible sender.",
    };
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.algorithm !== "BLAKE3") {
    return {
      kind: "err",
      message: "Integrity hash algorithm must be BLAKE3.",
      recovery: "Regenerate the manifest with a compatible sender.",
    };
  }
  const engine = record.engine === "wasm" || record.engine === "js" ? record.engine : "js";
  return normalizeBlake3(record.value, engine);
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file bytes for BLAKE3."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("File reader did not return bytes for BLAKE3."));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function blobChunks(blob: Blob): Promise<readonly Uint8Array[]> {
  if (typeof blob.stream === "function") {
    const chunks: Uint8Array[] = [];
    const reader = blob.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
    }
    return chunks;
  }
  return [new Uint8Array(await readBlobAsArrayBuffer(blob))];
}

async function wasmBlake3(chunks: readonly Uint8Array[]): Promise<IntegrityHash> {
  const hasher = await createBLAKE3(256);
  hasher.init();
  for (const chunk of chunks) {
    hasher.update(chunk);
  }
  return {
    algorithm: "BLAKE3",
    value: hasher.digest("hex") as Blake3Value,
    engine: "wasm",
  };
}

function jsBlake3(chunks: readonly Uint8Array[]): IntegrityHash {
  const hasher = nobleBlake3.create();
  for (const chunk of chunks) {
    hasher.update(chunk);
  }
  return {
    algorithm: "BLAKE3",
    value: bytesToHex(hasher.digest()) as Blake3Value,
    engine: "js",
  };
}

export async function blake3Bytes(bytes: Uint8Array): Promise<Blake3Result> {
  const chunks = [bytes] as const;
  try {
    return { kind: "ok", hash: await wasmBlake3(chunks) };
  } catch {
    return { kind: "ok", hash: jsBlake3(chunks) };
  }
}

export async function blake3Blob(blob: Blob): Promise<Blake3Result> {
  try {
    const chunks = await blobChunks(blob);
    try {
      return { kind: "ok", hash: await wasmBlake3(chunks) };
    } catch {
      return { kind: "ok", hash: jsBlake3(chunks) };
    }
  } catch {
    return {
      kind: "err",
      message: "Could not read file bytes for BLAKE3.",
      recovery: "Select the file again or use native tooling for this transfer.",
    };
  }
}
