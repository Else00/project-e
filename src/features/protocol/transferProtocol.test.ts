import { afterEach, describe, expect, it, vi } from "vitest";
import { unsafeByteSize } from "../../domain/scalars";
import type { BigfilePlan } from "../bigfile/bigfilePlan";
import swiftFixture from "../../../vendor/project-e-protocol/fixtures/interop/swift.json";
import {
  decodeTransfer,
  encodeDirectFile,
  prepareBigfileTransfer,
  protocolError,
} from "./transferProtocol";

const fileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read test file."));
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(new Uint8Array(reader.result))
        : reject(new Error("Expected test bytes."));
    reader.readAsArrayBuffer(file);
  });

const bytesFromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));

describe("web protocol adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["photo.png", "image/png", "image"],
    ["note.txt", "text/plain", "textUtf8"],
    ["archive.bin", "", "file"],
  ] as const)("round-trips %s", async (name, type, kind) => {
    const file = new File(["payload"], name, { type, lastModified: 7 });
    const encoded = await encodeDirectFile(file, new Uint8Array(16));
    expect(encoded.kind).toBe("ok");
    if (encoded.kind !== "ok") return;
    const decoded = decodeTransfer(await fileBytes(encoded.value));
    expect(decoded.kind).toBe("ok");
    if (decoded.kind !== "ok") return;
    expect(Array.from(decoded.value.payload)).toEqual(
      Array.from(new TextEncoder().encode("payload")),
    );
    expect(decoded.value.transfer).toMatchObject({
      kind: "direct",
      content: { fileName: name, kind },
    });
  });

  it("creates a random 16-byte transfer identity by default", async () => {
    const encoded = await encodeDirectFile(new File(["x"], "x.bin"));
    expect(encoded.kind).toBe("ok");
  });

  it("decodes Swift direct, manifest and chunk fixtures through the product adapter", () => {
    const direct = decodeTransfer(bytesFromHex(swiftFixture.directHex));
    const manifest = decodeTransfer(bytesFromHex(swiftFixture.manifestHex));
    const chunk = decodeTransfer(bytesFromHex(swiftFixture.chunkHex));

    expect(direct).toMatchObject({
      kind: "ok",
      value: { transfer: { kind: "direct", content: { kind: "textUtf8" } } },
    });
    expect(manifest).toMatchObject({
      kind: "ok",
      value: { transfer: { kind: "bigfileManifest", chunkCount: 2 } },
    });
    expect(chunk).toMatchObject({
      kind: "ok",
      value: { transfer: { kind: "bigfileChunk", number: 2, chunkCount: 2 } },
    });
  });

  it("uses native Blob reads and reports local read failures", async () => {
    const nativeFile = {
      name: "native.bin",
      type: "application/octet-stream",
      lastModified: 4,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as File;
    await expect(encodeDirectFile(nativeFile, new Uint8Array(16))).resolves.toMatchObject({
      kind: "ok",
    });

    vi.stubGlobal(
      "FileReader",
      class {
        result: string | ArrayBuffer | null = "not-bytes";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsArrayBuffer() {
          this.onload?.();
        }
      },
    );
    await expect(
      encodeDirectFile(new File(["x"], "x.bin"), new Uint8Array(16)),
    ).resolves.toMatchObject({
      kind: "err",
      error: { code: "fileReadFailed" },
    });
  });

  it("maps invalid direct and bigfile plans without throwing", async () => {
    await expect(
      encodeDirectFile(new File(["x"], "x.bin"), new Uint8Array()),
    ).resolves.toMatchObject({
      kind: "err",
    });

    const basePlan = {
      kind: "planned",
      fileName: "x.bin",
      size: unsafeByteSize(1),
      chunkBytes: unsafeByteSize(1),
      chunkCount: 1,
      encodeStreams: 1,
      chunks: [],
      message: "test",
      recommendedReceiver: "CFC Android",
      reassembly: "reassemble.html",
      hashRequired: true,
    } as const satisfies Extract<BigfilePlan, { readonly kind: "planned" }>;
    await expect(
      prepareBigfileTransfer(new File(["x"], "x.bin"), basePlan, new Uint8Array(16)),
    ).resolves.toMatchObject({ kind: "err", error: { code: "invalidBigfilePlan" } });

    const invalidManifestPlan = {
      ...basePlan,
      chunkCount: 0,
      chunks: [
        {
          index: 0,
          start: unsafeByteSize(0),
          end: unsafeByteSize(1),
          size: unsafeByteSize(1),
          encodeId: 1 as never,
          fileName: "x.bin.part-0001-of-0001",
        },
      ],
    };
    await expect(
      prepareBigfileTransfer(new File(["x"], "x.bin"), invalidManifestPlan, new Uint8Array(16)),
    ).resolves.toMatchObject({ kind: "err" });
  });

  it("reports read failures before preparing bigfile streams", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsArrayBuffer() {
          this.onerror?.();
        }
      },
    );
    const plan = {
      kind: "planned",
      fileName: "x.bin",
      size: unsafeByteSize(1),
      chunkBytes: unsafeByteSize(1),
      chunkCount: 1,
      encodeStreams: 1,
      chunks: [],
      message: "test",
      recommendedReceiver: "CFC Android",
      reassembly: "reassemble.html",
      hashRequired: true,
    } as const satisfies Extract<BigfilePlan, { readonly kind: "planned" }>;
    await expect(prepareBigfileTransfer(new File(["x"], "x.bin"), plan)).resolves.toMatchObject({
      kind: "err",
      error: { code: "fileReadFailed" },
    });
  });

  it("maps protocol failures to actionable product errors", () => {
    expect(decodeTransfer(new Uint8Array(60))).toEqual({
      kind: "err",
      error: {
        code: "invalidMagic",
        message: "The decoded bytes are not a Project E transfer.",
        recovery: "Scan a frame produced by a compatible project-e.transfer sender.",
      },
    });
    expect(protocolError({ code: "unsupportedMajor", major: 2 })).toMatchObject({
      code: "unsupportedMajor",
      message: "Protocol wire major 2 is unsupported.",
    });
    expect(protocolError({ code: "payloadHashMismatch", field: "content" })).toMatchObject({
      code: "payloadHashMismatch",
      message: "BLAKE3 integrity verification failed.",
    });
    expect(protocolError({ code: "metadataHashMismatch" })).toMatchObject({
      code: "metadataHashMismatch",
      message: "BLAKE3 integrity verification failed.",
    });
    expect(protocolError({ code: "truncatedPrelude", availableBytes: 1 })).toMatchObject({
      code: "truncatedPrelude",
      message: "Protocol validation failed: truncatedPrelude.",
    });
  });
});
