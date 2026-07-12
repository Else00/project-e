import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blake3Blob,
  blake3Bytes,
  normalizeBlake3,
  normalizeIntegrityHash,
} from "./bigfileIntegrity";

const emptyBlake3 = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";

describe("cimbar-bigfile integrity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes and rejects BLAKE3 values", () => {
    expect(normalizeBlake3(emptyBlake3.toUpperCase(), "wasm")).toEqual({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: emptyBlake3,
        engine: "wasm",
      },
    });
    expect(normalizeBlake3(null)).toMatchObject({
      kind: "err",
      message: "BLAKE3 must be a string.",
    });
    expect(normalizeBlake3("xyz")).toMatchObject({
      kind: "err",
      message: "BLAKE3 must be 64 hexadecimal characters.",
    });
  });

  it("normalizes BLAKE3 integrity hash objects", () => {
    expect(normalizeIntegrityHash({ algorithm: "BLAKE3", value: emptyBlake3 })).toEqual({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: emptyBlake3,
        engine: "js",
      },
    });
    expect(
      normalizeIntegrityHash({ algorithm: "BLAKE3", value: emptyBlake3, engine: "wasm" }),
    ).toMatchObject({ kind: "ok", hash: { engine: "wasm" } });
    expect(normalizeIntegrityHash({ algorithm: "MD5", value: emptyBlake3 })).toMatchObject({
      kind: "err",
      message: "Integrity hash algorithm must be BLAKE3.",
    });
    expect(normalizeIntegrityHash(null)).toMatchObject({
      kind: "err",
      message: "Integrity hash must be a BLAKE3 object with algorithm and value.",
    });
    expect(normalizeIntegrityHash([])).toMatchObject({
      kind: "err",
      message: "Integrity hash must be a BLAKE3 object with algorithm and value.",
    });
  });

  it("hashes bytes and blobs with BLAKE3", async () => {
    await expect(blake3Bytes(new Uint8Array())).resolves.toMatchObject({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: emptyBlake3,
      },
    });
    await expect(blake3Blob(new Blob([]))).resolves.toMatchObject({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: emptyBlake3,
      },
    });
  });

  it("uses the bundled JavaScript BLAKE3 implementation when WASM initialization fails", async () => {
    vi.resetModules();
    vi.doMock("hash-wasm", () => ({
      createBLAKE3: vi.fn(async () => {
        throw new Error("WASM unavailable");
      }),
    }));
    const fallback = await import("./bigfileIntegrity");
    await expect(fallback.blake3Bytes(new Uint8Array())).resolves.toMatchObject({
      kind: "ok",
      hash: { engine: "js", value: emptyBlake3 },
    });
    await expect(fallback.blake3Blob(new Blob([]))).resolves.toMatchObject({
      kind: "ok",
      hash: { engine: "js", value: emptyBlake3 },
    });
    vi.doUnmock("hash-wasm");
    vi.resetModules();
  });

  it("hashes blobs through fallback readers", async () => {
    await expect(
      blake3Blob({
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Blob),
    ).resolves.toMatchObject({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: emptyBlake3,
      },
    });

    vi.stubGlobal(
      "FileReader",
      class {
        result: ArrayBuffer | string | null = new ArrayBuffer(0);
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsArrayBuffer() {
          this.onload?.();
        }
      },
    );
    await expect(blake3Blob({} as Blob)).resolves.toMatchObject({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: emptyBlake3,
      },
    });
  });

  it("hashes streamed blob chunks", async () => {
    await expect(
      blake3Blob({
        stream: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3, 4, 5]));
              controller.close();
            },
          }),
      } as Blob),
    ).resolves.toMatchObject({
      kind: "ok",
      hash: {
        algorithm: "BLAKE3",
        value: "024f67c0425a3dc02fbaf58cb93de5132e3d75c519faa0bada21491d88c97057",
      },
    });
  });

  it("reports fallback file reader failures", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result: ArrayBuffer | string | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsArrayBuffer() {
          this.onerror?.();
        }
      },
    );
    await expect(blake3Blob({} as Blob)).resolves.toMatchObject({
      kind: "err",
      message: "Could not read file bytes for BLAKE3.",
    });

    vi.stubGlobal(
      "FileReader",
      class {
        result: ArrayBuffer | string | null = "not-bytes";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsArrayBuffer() {
          this.onload?.();
        }
      },
    );
    await expect(blake3Blob({} as Blob)).resolves.toMatchObject({
      kind: "err",
      message: "Could not read file bytes for BLAKE3.",
    });
  });
});
