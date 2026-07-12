import { blake3 } from "@noble/hashes/blake3.js";
import {
  createPreludePolicy,
  decodeProtocolEnvelope,
  encodeBigfileChunkEnvelope,
  encodeBigfileManifestEnvelope,
  encodeDirectEnvelope,
  type DecodedProtocolEnvelope,
  type ProtocolFileContent,
} from "project-e-protocol";
import { describe, expect, it } from "vitest";
import { bigfileBrowserSessionLimit } from "./bigfilePlan";
import {
  acceptDecodedBigfileEnvelope,
  emptyBigfileReassemblyState,
  type BigfileReassemblyState,
} from "./bigfileReassembly";

const policyResult = createPreludePolicy(BigInt(bigfileBrowserSessionLimit));
if (!policyResult.ok) throw new Error("Expected browser protocol policy.");
const policy = policyResult.value;
const transferId = new Uint8Array(16);
const source = new Uint8Array([1, 2, 3, 4, 5]);

const fileContent = (overrides: Partial<ProtocolFileContent> = {}): ProtocolFileContent => ({
  fileName: "final.bin",
  mediaType: "application/octet-stream",
  kind: "file",
  size: 5n,
  blake3: blake3(source),
  ...overrides,
});

const anonymousFileContent = (): ProtocolFileContent => {
  const { fileName: _fileName, ...content } = fileContent();
  return content;
};

const unwrapDecoded = (bytes: Uint8Array): DecodedProtocolEnvelope => {
  const decoded = decodeProtocolEnvelope(bytes, policy);
  if (!decoded.ok) throw new Error(`Expected valid envelope: ${decoded.error.code}`);
  return decoded.value;
};

const manifestEnvelope = (
  file: ProtocolFileContent = fileContent(),
  descriptors = [
    { number: 1, offset: 0n, length: 3n, blake3: blake3(source.slice(0, 3)) },
    { number: 2, offset: 3n, length: 2n, blake3: blake3(source.slice(3)) },
  ],
): DecodedProtocolEnvelope => {
  const encoded = encodeBigfileManifestEnvelope(
    {
      transferId,
      file,
      chunkCount: 2,
      nominalChunkSize: 3n,
      chunks: descriptors,
    },
    policy,
  );
  if (!encoded.ok) throw new Error(`Expected manifest: ${encoded.error.code}`);
  return unwrapDecoded(encoded.value.bytes);
};

const chunkEnvelope = (
  number: 1 | 2,
  options: Readonly<{
    id?: Uint8Array;
    file?: ProtocolFileContent;
    offset?: bigint;
    payload?: Uint8Array;
  }> = {},
): DecodedProtocolEnvelope => {
  const payload = options.payload ?? (number === 1 ? source.slice(0, 3) : source.slice(3));
  const encoded = encodeBigfileChunkEnvelope(
    {
      transferId: options.id ?? transferId,
      file: options.file ?? fileContent(),
      number,
      chunkCount: 2,
      offset: options.offset ?? (number === 1 ? 0n : 3n),
      payload,
    },
    policy,
  );
  if (!encoded.ok) throw new Error(`Expected chunk: ${encoded.error.code}`);
  return unwrapDecoded(encoded.value.bytes);
};

describe("protocol bigfile reassembly", () => {
  it("collects verified chunks before or after the manifest and reassembles by numeric range", () => {
    const empty = emptyBigfileReassemblyState();
    expect(empty).toMatchObject({ kind: "empty" });

    const second = acceptDecodedBigfileEnvelope(empty, chunkEnvelope(2));
    expect(second).toMatchObject({
      kind: "ok",
      state: { kind: "collecting", missingNumbers: [1], manifest: null },
    });
    if (second.kind !== "ok") throw new Error("Expected second chunk.");

    const manifest = acceptDecodedBigfileEnvelope(second.state, manifestEnvelope());
    expect(manifest).toMatchObject({ kind: "ok", state: { kind: "collecting" } });
    if (manifest.kind !== "ok") throw new Error("Expected manifest.");

    const first = acceptDecodedBigfileEnvelope(manifest.state, chunkEnvelope(1));
    expect(first).toMatchObject({
      kind: "ok",
      state: { kind: "complete", fileName: "final.bin", missingNumbers: [] },
    });
    if (first.kind !== "ok" || first.state.kind !== "complete") {
      throw new Error("Expected complete transfer.");
    }
    expect(Array.from(first.state.bytes)).toEqual(Array.from(source));
  });

  it("supports manifest-first collection and idempotent chunk replacement", () => {
    const manifest = acceptDecodedBigfileEnvelope(
      emptyBigfileReassemblyState(),
      manifestEnvelope(anonymousFileContent()),
    );
    if (manifest.kind !== "ok") throw new Error("Expected manifest.");
    expect(manifest.state).toMatchObject({
      kind: "collecting",
      fileName: "project-e-000000000000.bin",
      missingNumbers: [1, 2],
    });
    const first = acceptDecodedBigfileEnvelope(
      manifest.state,
      chunkEnvelope(1, {
        file: anonymousFileContent(),
      }),
    );
    if (first.kind !== "ok") throw new Error("Expected chunk.");
    const replacement = acceptDecodedBigfileEnvelope(
      first.state,
      chunkEnvelope(1, {
        file: anonymousFileContent(),
      }),
    );
    expect(replacement).toMatchObject({
      kind: "ok",
      state: { kind: "collecting", received: [{ number: 1 }], missingNumbers: [2] },
    });
  });

  it("rejects direct transfers and conflicting transfer identities", () => {
    const direct = encodeDirectEnvelope(
      { transferId, payload: source, content: { fileName: "direct.bin", kind: "file" } },
      policy,
    );
    if (!direct.ok) throw new Error("Expected direct envelope.");
    expect(
      acceptDecodedBigfileEnvelope(
        emptyBigfileReassemblyState(),
        unwrapDecoded(direct.value.bytes),
      ),
    ).toMatchObject({
      kind: "err",
      message: "A direct transfer cannot enter the bigfile collector.",
    });

    const collecting = acceptDecodedBigfileEnvelope(
      emptyBigfileReassemblyState(),
      manifestEnvelope(),
    );
    if (collecting.kind !== "ok") throw new Error("Expected collecting state.");
    expect(
      acceptDecodedBigfileEnvelope(
        collecting.state,
        chunkEnvelope(1, { id: new Uint8Array(16).fill(1) }),
      ),
    ).toMatchObject({
      kind: "err",
      message: "The chunk belongs to a different or conflicting transfer.",
    });

    const otherManifest = manifestEnvelope(fileContent({ fileName: "other.bin" }));
    expect(acceptDecodedBigfileEnvelope(collecting.state, otherManifest)).toMatchObject({
      kind: "err",
      message: "The manifest belongs to a different or conflicting transfer.",
    });
  });

  it("enforces the browser file-size policy for manifest and chunk entry points", () => {
    const oversized = fileContent({
      size: BigInt(bigfileBrowserSessionLimit + 1),
      blake3: new Uint8Array(32),
    });
    const oversizedManifest = manifestEnvelope(oversized, [
      {
        number: 1,
        offset: 0n,
        length: BigInt(bigfileBrowserSessionLimit),
        blake3: new Uint8Array(32),
      },
      {
        number: 2,
        offset: BigInt(bigfileBrowserSessionLimit),
        length: 1n,
        blake3: new Uint8Array(32),
      },
    ]);
    expect(
      acceptDecodedBigfileEnvelope(emptyBigfileReassemblyState(), oversizedManifest),
    ).toMatchObject({
      kind: "err",
      message: "The declared bigfile size exceeds this browser session policy.",
    });

    const syntheticChunk = {
      ...chunkEnvelope(1),
      transfer: {
        ...chunkEnvelope(1).transfer,
        file: { ...fileContent(), size: BigInt(bigfileBrowserSessionLimit + 1) },
      },
    } as unknown as DecodedProtocolEnvelope;
    expect(
      acceptDecodedBigfileEnvelope(emptyBigfileReassemblyState(), syntheticChunk),
    ).toMatchObject({
      kind: "err",
      message: "The declared bigfile size exceeds this browser session policy.",
    });
  });

  it("rejects unsafe ranges, descriptor conflicts and final digest mismatches", () => {
    const initial = acceptDecodedBigfileEnvelope(emptyBigfileReassemblyState(), manifestEnvelope());
    if (initial.kind !== "ok") throw new Error("Expected collecting state.");

    const validChunk = chunkEnvelope(1);
    const unsafeChunk = {
      ...validChunk,
      transfer: { ...validChunk.transfer, offset: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
    } as unknown as DecodedProtocolEnvelope;
    expect(acceptDecodedBigfileEnvelope(initial.state, unsafeChunk)).toMatchObject({
      kind: "err",
      message: "The verified chunk range cannot be represented safely.",
    });

    const conflictingManifest = acceptDecodedBigfileEnvelope(
      emptyBigfileReassemblyState(),
      manifestEnvelope(),
    );
    if (conflictingManifest.kind !== "ok") throw new Error("Expected manifest.");
    const first = acceptDecodedBigfileEnvelope(
      conflictingManifest.state,
      chunkEnvelope(1, { offset: 1n }),
    );
    if (first.kind !== "ok") throw new Error("Expected first chunk.");
    expect(acceptDecodedBigfileEnvelope(first.state, chunkEnvelope(2))).toMatchObject({
      kind: "err",
      message: "A verified chunk conflicts with the manifest descriptors.",
    });

    const wrongDigest = fileContent({ blake3: new Uint8Array(32) });
    const wrongManifest = acceptDecodedBigfileEnvelope(
      emptyBigfileReassemblyState(),
      manifestEnvelope(wrongDigest),
    );
    if (wrongManifest.kind !== "ok") throw new Error("Expected manifest.");
    const wrongFirst = acceptDecodedBigfileEnvelope(
      wrongManifest.state,
      chunkEnvelope(1, { file: wrongDigest }),
    );
    if (wrongFirst.kind !== "ok") throw new Error("Expected first chunk.");
    expect(
      acceptDecodedBigfileEnvelope(wrongFirst.state, chunkEnvelope(2, { file: wrongDigest })),
    ).toMatchObject({
      kind: "err",
      message: "The reassembled file does not match the manifest digest.",
    });
  });

  it("keeps the previous state when a synthetic negative file size is rejected", () => {
    const base = chunkEnvelope(1);
    const invalid = {
      ...base,
      transfer: { ...base.transfer, file: { ...fileContent(), size: -1n } },
    } as unknown as DecodedProtocolEnvelope;
    const state: BigfileReassemblyState = emptyBigfileReassemblyState();
    expect(acceptDecodedBigfileEnvelope(state, invalid)).toMatchObject({ kind: "err", state });
  });
});
