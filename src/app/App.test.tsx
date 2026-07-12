import { blake3 } from "@noble/hashes/blake3.js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createPreludePolicy,
  encodeBigfileChunkEnvelope,
  encodeBigfileManifestEnvelope,
} from "project-e-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { percent, unsafeByteSize } from "../domain/scalars";
import type { DecoderAdapterEvent, DecoderEventSink } from "../features/decoder/decoderAdapter";
import { encodeDirectFile } from "../features/protocol/transferProtocol";
import App from "./App";

const testPolicyResult = createPreludePolicy(512n * 1_024n * 1_024n);
if (!testPolicyResult.ok) throw new Error("Expected browser protocol policy.");
const testPolicy = testPolicyResult.value;

function protocolBigfileBytes(): readonly Uint8Array[] {
  const transferId = new Uint8Array(16);
  const source = new Uint8Array([1, 2, 3, 4, 5]);
  const file = {
    fileName: "joined.bin",
    mediaType: "application/octet-stream",
    kind: "file" as const,
    size: 5n,
    blake3: blake3(source),
  };
  const chunks = [
    { number: 1, offset: 0n, payload: source.slice(0, 3) },
    { number: 2, offset: 3n, payload: source.slice(3) },
  ] as const;
  const manifest = encodeBigfileManifestEnvelope(
    {
      transferId,
      file,
      chunkCount: chunks.length,
      nominalChunkSize: 3n,
      chunks: chunks.map((chunk) => ({
        number: chunk.number,
        offset: chunk.offset,
        length: BigInt(chunk.payload.byteLength),
        blake3: blake3(chunk.payload),
      })),
    },
    testPolicy,
  );
  if (!manifest.ok) throw new Error(`Expected manifest: ${manifest.error.code}`);
  const encodedChunks = chunks.map((chunk) => {
    const encoded = encodeBigfileChunkEnvelope(
      {
        transferId,
        file,
        number: chunk.number,
        chunkCount: chunks.length,
        offset: chunk.offset,
        payload: chunk.payload,
      },
      testPolicy,
    );
    if (!encoded.ok) throw new Error(`Expected chunk: ${encoded.error.code}`);
    return encoded.value.bytes;
  });
  return [manifest.value.bytes, ...encodedChunks];
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
        return;
      }
      reject(new Error("unexpected read result"));
    };
    reader.readAsArrayBuffer(file);
  });
}

describe("Cimbar workbench UI", () => {
  let cameraTrackStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cameraTrackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: cameraTrackStop }] } as unknown as MediaStream;
    vi.stubGlobal("WebAssembly", {});
    vi.stubGlobal("Worker", function Worker() {});
    vi.stubGlobal("VideoFrame", function VideoFrame() {});
    Object.defineProperty(window.HTMLVideoElement.prototype, "requestVideoFrameCallback", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
    });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("showSaveFilePicker", vi.fn());
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    HTMLElement.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  }, 15_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders technical controls and completes the encode/decode flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "project-e" })).toBeInTheDocument();
    expect(screen.getByText("supported")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Encode" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByText("Fullscreen display target")).toBeInTheDocument();
    expect(screen.getByText(/\d+:\d+ · measuring Hz/)).toBeInTheDocument();
    expect(screen.getByText("WebAssembly codec")).toBeInTheDocument();
    expect(screen.getByText("File picker save")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transfer protocol" })).toBeInTheDocument();
    expect(screen.getByText("0.2.1", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("0.2.0", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("1.0 · major 1 only")).toBeInTheDocument();
    expect(screen.getByText("direct · bigfile manifest · bigfile chunk")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Encode" }));
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "dark");
    expect(screen.queryByRole("button", { name: "System" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Light" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Fast/ }));
    await user.upload(
      screen.getByLabelText("Choose file to encode"),
      new File(["hello"], "hello.txt"),
    );
    expect(screen.getByText("Good size for a direct Cimbar browser transfer.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Render frames" }));
    await waitFor(() => expect(screen.getAllByText("hello.txt").length).toBeGreaterThanOrEqual(1));
    await waitFor(() =>
      expect(screen.getByText(/Symbol \d+ · rendering · no fixed total/)).toBeInTheDocument(),
    );
    const firstFrameText = screen.getByText(/Symbol \d+ · rendering · no fixed total/).textContent;
    await user.click(screen.getByRole("button", { name: /^Bu/ }));
    expect(screen.getByText("BU · 66")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Symbol \d+ · rendering · no fixed total/)).not.toHaveTextContent(
        firstFrameText ?? "",
      ),
    );
    expect(screen.queryByRole("button", { name: "Render frames" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show code fullscreen" }));
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();
    expect(screen.getAllByText("Direct envelope").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Bigfile chunks")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByText("Fullscreen display target")).toBeInTheDocument();
    expect(screen.getByText(/Viewport .* · \d+:\d+/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d+:1/)).not.toBeInTheDocument();
    expect(screen.queryByText("Monitor ratio")).not.toBeInTheDocument();
    expect(screen.getByText("Camera API")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Encode" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText(/paused/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume frames" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Decode" }));
    await user.click(screen.getByRole("button", { name: "Start camera" }));
    expect(await screen.findByText("scanning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start camera" })).not.toBeInTheDocument();
    expect(screen.getByText("No decoded file")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByText("stopped")).toBeInTheDocument();
    expect(cameraTrackStop).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByText("Local-only by design")).toBeInTheDocument();
  }, 15_000);

  it("shows direct warnings for invalid settings and files", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText("Choose file to encode"), new File([""], "empty.bin"));
    expect(screen.getAllByText(/Empty files cannot produce/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Render frames" })).toBeDisabled();
    expect(screen.getAllByText(/Empty files cannot produce/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: /Advanced encoder configuration/ }));
    fireEvent.change(screen.getByLabelText("FPS"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Redundancy"), { target: { value: "1.1" } });
    expect(screen.getByText(/High FPS can outrun/)).toBeInTheDocument();
    expect(screen.getByText(/Low redundancy leaves little room/)).toBeInTheDocument();

    await user.click(screen.getByTitle(/Sender FPS controls animation speed/));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Range: 1-30");
    expect(screen.getByRole("button", { name: "Close parameter detail" })).toBeInTheDocument();
  });

  it("disables impossible actions and reapplies the active preset", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Render frames" })).toBeDisabled();
    expect(screen.queryByText("Choose file first.")).not.toBeInTheDocument();
    const fpsInput = screen.getByRole("spinbutton", { name: "FPS" });
    await user.clear(fpsInput);
    expect(fpsInput).toHaveDisplayValue("");
    await user.type(fpsInput, "18");
    expect(fpsInput).toHaveValue(18);
    await user.clear(fpsInput);
    expect(fpsInput).toHaveDisplayValue("");
    await user.tab();
    expect(fpsInput).toHaveValue(18);
    await user.click(screen.getByRole("button", { name: /^Balanced/ }));
    expect(fpsInput).toHaveValue(12);
  });

  it("uses typed text as a local UTF-8 file source", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Use text" })).toBeDisabled();
    await user.type(screen.getByLabelText("Text to encode"), "ciao da project-e");
    await user.clear(screen.getByLabelText("Text file name"));
    await user.type(screen.getByLabelText("Text file name"), "notes");
    await user.click(screen.getByRole("button", { name: "Use text" }));

    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("Good size for a direct Cimbar browser transfer.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Render frames" }));
    await waitFor(() => expect(screen.getAllByText("notes.txt").length).toBeGreaterThanOrEqual(1));
  });

  it("blocks protocol encoding when local file bytes cannot be read", async () => {
    const user = userEvent.setup();
    class FailingFileReader {
      onerror: (() => void) | null = null;

      readAsArrayBuffer() {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);
    render(<App />);

    await user.upload(
      screen.getByLabelText("Choose file to encode"),
      new File(["hello"], "hello.txt"),
    );
    await user.click(screen.getByRole("button", { name: "Render frames" }));

    expect(
      await screen.findByText(
        "The selected file could not be read locally. Select the file again and keep it available until encoding starts.",
      ),
    ).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("auto-configures bigfile mode and renders manifest then chunk streams", async () => {
    const user = userEvent.setup();
    render(<App />);

    const file = new File([new Uint8Array(11 * 1_024 * 1_024)], "archive.bin");
    await user.upload(screen.getByLabelText("Choose file to encode"), file);

    await waitFor(() => expect(screen.getAllByText("planned").length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText(/Auto bigfile active/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "FPS" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "Redundancy" })).toHaveValue(3.5);
    expect(screen.getByText("Transfer manifest")).toBeInTheDocument();
    expect(screen.getByText(/Stream 1\/3 · zero-payload metadata envelope/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Render manifest" }));
    await waitFor(() => expect(screen.getByText(/archive.bin · manifest/)).toBeInTheDocument());
    expect(screen.getByText(/Symbol \d+ · rendering · no fixed total/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Next stream" }));
    expect(screen.getByText("archive.bin.part-0001-of-0002")).toBeInTheDocument();
    expect(screen.getByText(/Stream 2\/3 · chunk 1\/2/)).toBeInTheDocument();
  }, 15_000);

  it("unwraps verified direct decode envelopes before download", async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let sink: DecoderEventSink | null = null;
    render(
      <App
        createDecoderAdapter={(_canDecode, _videoProvider, onEvent) => {
          sink = onEvent;
          return {
            start: vi.fn(async () => ({ kind: "camera-ready", stream }) as DecoderAdapterEvent),
            stop: vi.fn(async () => ({ kind: "progress", streams: [] }) as DecoderAdapterEvent),
          };
        }}
      />,
    );
    const envelope = await encodeDirectFile(new File([new Uint8Array([1, 2, 3])], "plain.bin"));
    if (envelope.kind !== "ok") {
      throw new Error("Expected verified envelope.");
    }

    await user.click(screen.getByRole("button", { name: "Decode" }));
    await user.click(screen.getByRole("button", { name: "Start camera" }));
    if (!sink) {
      throw new Error("Expected decoder sink.");
    }
    const bytes = await fileBytes(envelope.value);
    act(() => {
      sink?.({
        kind: "complete",
        fileName: envelope.value.name,
        size: unsafeByteSize(bytes.byteLength),
        bytes,
      });
    });

    await waitFor(() =>
      expect(screen.getByText("project-e.transfer v1 BLAKE3 verified.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Download decoded file" })).toHaveAttribute(
      "download",
      "plain.bin",
    );
  });

  it("shows camera diagnostics before fountain progress exists", async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let sink: DecoderEventSink | null = null;
    render(
      <App
        createDecoderAdapter={(_canDecode, _videoProvider, onEvent) => {
          sink = onEvent;
          return {
            start: vi.fn(
              async () =>
                ({
                  kind: "camera-ready",
                  stream,
                  diagnostics: {
                    sampledFrames: 0,
                    postedFrames: 0,
                    noDataFrames: 0,
                    failedExtractFrames: 0,
                    decodedFrames: 0,
                    workerErrors: 0,
                    inFlightFrames: 0,
                    lastFrame: null,
                    camera: {
                      width: 1920,
                      height: 1080,
                      frameRate: 30,
                      facingMode: "environment",
                      aspectRatio: 16 / 9,
                      resizeMode: null,
                      supportsTorch: false,
                      supportsZoom: false,
                    },
                    lastWorkerMessage: null,
                  },
                }) as DecoderAdapterEvent,
            ),
            stop: vi.fn(async () => ({ kind: "progress", streams: [] }) as DecoderAdapterEvent),
          };
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Decode" }));
    await user.click(screen.getByRole("button", { name: "Start camera" }));
    expect(await screen.findByText("1080p/30fps")).toBeInTheDocument();
    if (!sink) {
      throw new Error("Expected decoder sink.");
    }

    act(() => {
      sink?.({
        kind: "diagnostic",
        diagnostics: {
          sampledFrames: 8,
          postedFrames: 6,
          noDataFrames: 5,
          failedExtractFrames: 1,
          decodedFrames: 0,
          workerErrors: 0,
          inFlightFrames: 0,
          lastFrame: { width: 1920, height: 1080, format: "RGBA" },
          camera: {
            width: 1920,
            height: 1080,
            frameRate: 30,
            facingMode: "environment",
            aspectRatio: 16 / 9,
            resizeMode: null,
            supportsTorch: false,
            supportsZoom: false,
          },
          lastWorkerMessage: "Symbols were detected, but extraction failed.",
        },
      });
    });

    expect(screen.getByRole("progressbar", { name: "Decode progress" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText("RGBA 1920x1080")).toBeInTheDocument();
    expect(screen.getByText("5/1/0")).toBeInTheDocument();
    expect(screen.getByText("Symbols were detected, but extraction failed.")).toBeInTheDocument();
  });

  it("blocks corrupted direct decode envelopes", async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let sink: DecoderEventSink | null = null;
    render(
      <App
        createDecoderAdapter={(_canDecode, _videoProvider, onEvent) => {
          sink = onEvent;
          return {
            start: vi.fn(async () => ({ kind: "camera-ready", stream }) as DecoderAdapterEvent),
            stop: vi.fn(async () => ({ kind: "progress", streams: [] }) as DecoderAdapterEvent),
          };
        }}
      />,
    );
    const envelope = await encodeDirectFile(new File([new Uint8Array([1, 2, 3])], "plain.bin"));
    if (envelope.kind !== "ok") {
      throw new Error("Expected verified envelope.");
    }
    const bytes = await fileBytes(envelope.value);
    bytes[bytes.byteLength - 1] = 4;

    await user.click(screen.getByRole("button", { name: "Decode" }));
    await user.click(screen.getByRole("button", { name: "Start camera" }));
    if (!sink) {
      throw new Error("Expected decoder sink.");
    }
    act(() => {
      sink?.({
        kind: "complete",
        fileName: envelope.value.name,
        size: unsafeByteSize(bytes.byteLength),
        bytes,
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/BLAKE3 integrity verification failed/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: "Download decoded file" })).not.toBeInTheDocument();
  });

  it("routes decoder completion events into bigfile reassembly and verifies BLAKE3", async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let sink: DecoderEventSink | null = null;
    render(
      <App
        createDecoderAdapter={(_canDecode, _videoProvider, onEvent) => {
          sink = onEvent;
          return {
            start: vi.fn(async () => ({ kind: "camera-ready", stream }) as DecoderAdapterEvent),
            stop: vi.fn(async () => ({ kind: "progress", streams: [] }) as DecoderAdapterEvent),
          };
        }}
      />,
    );

    const [manifestBytes, firstChunkBytes, secondChunkBytes] = protocolBigfileBytes();
    if (!manifestBytes || !firstChunkBytes || !secondChunkBytes) {
      throw new Error("Expected protocol bigfile streams.");
    }
    await user.click(screen.getByRole("button", { name: "Decode" }));
    await user.click(screen.getByRole("button", { name: "Start camera" }));
    expect(await screen.findByText("scanning")).toBeInTheDocument();
    if (!sink) {
      throw new Error("Expected decoder sink.");
    }

    act(() => {
      const progress = percent(0.42);
      if (progress.kind !== "ok") {
        throw new Error("Expected valid progress.");
      }
      sink?.({
        kind: "progress",
        streams: [{ streamId: "stream-1", progress: progress.value }],
      });
    });
    expect(screen.getByRole("progressbar", { name: "Decode progress" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );

    act(() => {
      sink?.({
        kind: "complete",
        fileName: "transfer-manifest.pje",
        size: unsafeByteSize(manifestBytes.byteLength),
        bytes: manifestBytes,
      });
    });
    await waitFor(() =>
      expect(screen.getByText("0/2 verified chunks received.")).toBeInTheDocument(),
    );
    act(() => {
      sink?.({
        kind: "complete",
        fileName: "transfer-chunk-1.pje",
        size: unsafeByteSize(firstChunkBytes.byteLength),
        bytes: firstChunkBytes,
      });
    });
    await waitFor(() =>
      expect(screen.getByText("1/2 verified chunks received.")).toBeInTheDocument(),
    );
    act(() => {
      sink?.({
        kind: "complete",
        fileName: "transfer-chunk-2.pje",
        size: unsafeByteSize(secondChunkBytes.byteLength),
        bytes: secondChunkBytes,
      });
    });

    await waitFor(() =>
      expect(
        screen.getByText("All chunks and the final project-e.transfer BLAKE3 are verified."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Download reassembled file" })).toHaveAttribute(
      "download",
      "joined.bin",
    );
  });
});
