import type { CimbarMode, DecoderConfig } from "../../domain/cimbar";
import type { ByteSize, Percent } from "../../domain/scalars";
import type { CameraTrackSnapshot, DecodeDiagnostics, DecodeProgress } from "../../domain/state";
import { parseWorkerMessage } from "../../domain/validators";
import { cimbarVendorManifest, vendorAssetPath } from "../../vendor/cimbarVendorManifest";

export type DecoderAdapterEvent =
  | Readonly<{ kind: "camera-ready"; stream: MediaStream; diagnostics?: DecodeDiagnostics }>
  | Readonly<{ kind: "diagnostic"; diagnostics: DecodeDiagnostics }>
  | Readonly<{ kind: "progress"; streams: readonly DecodeProgress[] }>
  | Readonly<{ kind: "complete"; fileName: string; size: ByteSize; bytes: Uint8Array }>
  | Readonly<{ kind: "error"; message: string; recovery: string }>;

export type DecoderAdapter = Readonly<{
  start(config: DecoderConfig): Promise<DecoderAdapterEvent>;
  stop(): Promise<DecoderAdapterEvent>;
}>;

export type VideoProvider = () => HTMLVideoElement | null;
export type DecoderEventSink = (event: DecoderAdapterEvent) => void;

/* v8 ignore start -- real browser camera/WASM bridge is verified by Playwright. */
type CimbarDecoderModule = Readonly<{
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _cimbard_configure_decode(mode: number): number;
  _cimbard_decompress_read(id: number, ptr: number, size: number): number;
  _cimbard_fountain_decode(ptr: number, size: number): bigint | number;
  _cimbard_get_bufsize(): number;
  _cimbard_get_decompress_bufsize(): number;
  _cimbard_get_filename(id: number, ptr: number, size: number): number;
  _cimbard_get_filesize(id: number): number;
  _cimbard_get_report(ptr: number, size: number): number;
}>;

type CimbarWindow = Window &
  typeof globalThis & {
    Module?: Partial<CimbarDecoderModule> & {
      onRuntimeInitialized?: () => void;
    };
    __cimbarRuntimeReady?: Promise<void>;
  };

type WorkerMessage =
  | Readonly<{ ready: string; type?: "startWasm" }>
  | Readonly<{ error: true; res?: unknown }>
  | Readonly<{ failed_extract: true }>
  | Readonly<{ nodata: true }>
  | Readonly<{ mode: number; buff: Uint8Array }>;

function modeValue(mode: CimbarMode): number {
  switch (mode) {
    case "auto":
      return 0;
    case "4c":
      return 4;
    case "bu":
      return 66;
    case "bm":
      return 67;
    case "b":
      return 68;
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.cimbarLoaded === "true") {
    return Promise.resolve();
  }
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener(
      "load",
      () => {
        script.dataset.cimbarLoaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
      once: true,
    });
    document.body.append(script);
  });
}

async function ensureDecoderRuntime(): Promise<CimbarDecoderModule> {
  const cimbarWindow = window as CimbarWindow;
  if (!cimbarWindow.__cimbarRuntimeReady) {
    cimbarWindow.__cimbarRuntimeReady = new Promise<void>((resolve) => {
      cimbarWindow.Module = {
        onRuntimeInitialized: resolve,
      };
    });
    await loadScript(vendorAssetPath(cimbarVendorManifest.files.glue));
  }
  await cimbarWindow.__cimbarRuntimeReady;
  const module = cimbarWindow.Module as CimbarDecoderModule | undefined;
  if (!module) {
    throw new Error("Cimbar decoder runtime did not initialize.");
  }
  return module;
}

function copyToReusableHeap(
  module: CimbarDecoderModule,
  current: Uint8Array | undefined,
  size: number,
): Uint8Array {
  if (current && current.byteLength >= size && current.buffer === module.HEAPU8.buffer) {
    return current;
  }
  if (current) {
    module._free(current.byteOffset);
  }
  const ptr = module._malloc(size);
  return new Uint8Array(module.HEAPU8.buffer, ptr, size);
}

function readReport(module: CimbarDecoderModule): string | readonly DecodeProgress[] | undefined {
  const reportBuffer = copyToReusableHeap(module, undefined, 2048);
  try {
    const length = module._cimbard_get_report(reportBuffer.byteOffset, reportBuffer.byteLength);
    if (length <= 0) {
      return undefined;
    }
    const text = new TextDecoder().decode(
      new Uint8Array(module.HEAPU8.buffer, reportBuffer.byteOffset, length),
    );
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        .map((progress, index) => ({
          streamId: String(index + 1),
          progress: Math.max(0, Math.min(1, progress)) as Percent,
        }));
    }
    return text;
  } catch {
    return undefined;
  } finally {
    module._free(reportBuffer.byteOffset);
  }
}

function normalizeDecodeId(result: bigint | number): number | null {
  if (typeof result === "bigint") {
    return result > 0n ? Number(result & 0xffffffffn) : null;
  }
  return result > 0 ? result : null;
}

function readFilename(module: CimbarDecoderModule, id: number, fallbackSize: number): string {
  const nameBuffer = copyToReusableHeap(module, undefined, 2048);
  try {
    const length = module._cimbard_get_filename(id, nameBuffer.byteOffset, nameBuffer.byteLength);
    if (length <= 0) {
      return `${id}.${fallbackSize}.bin`;
    }
    return new TextDecoder("utf-8").decode(
      new Uint8Array(module.HEAPU8.buffer, nameBuffer.byteOffset, length),
    );
  } finally {
    module._free(nameBuffer.byteOffset);
  }
}

function readDecodedBytes(module: CimbarDecoderModule, id: number): Uint8Array {
  const chunkSize = module._cimbard_get_decompress_bufsize();
  const chunkBuffer = copyToReusableHeap(module, undefined, chunkSize);
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const read = module._cimbard_decompress_read(id, chunkBuffer.byteOffset, chunkSize);
      if (read <= 0) {
        break;
      }
      chunks.push(new Uint8Array(module.HEAPU8.buffer, chunkBuffer.byteOffset, read).slice());
    }
  } finally {
    module._free(chunkBuffer.byteOffset);
  }
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isWorkerMessage(data: unknown): data is WorkerMessage {
  return typeof data === "object" && data !== null;
}

const emptyDiagnostics: DecodeDiagnostics = {
  sampledFrames: 0,
  postedFrames: 0,
  noDataFrames: 0,
  failedExtractFrames: 0,
  decodedFrames: 0,
  workerErrors: 0,
  inFlightFrames: 0,
  lastFrame: null,
  camera: null,
  lastWorkerMessage: null,
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function snapshotCameraTrack(stream: MediaStream): CameraTrackSnapshot | null {
  if (typeof stream.getVideoTracks !== "function") {
    return null;
  }
  const [track] = stream.getVideoTracks();
  if (!track) {
    return null;
  }
  const settings = track.getSettings();
  const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined;
  const torchCapability = capabilities?.torch;
  return {
    width: numberOrNull(settings.width),
    height: numberOrNull(settings.height),
    frameRate: numberOrNull(settings.frameRate),
    facingMode: stringOrNull(settings.facingMode),
    aspectRatio: numberOrNull(settings.aspectRatio),
    resizeMode: stringOrNull((settings as Record<string, unknown>).resizeMode),
    supportsTorch: Array.isArray(torchCapability)
      ? torchCapability.includes(true)
      : Boolean(torchCapability),
    supportsZoom: Boolean(capabilities?.zoom),
  };
}

function cameraConstraints(config: DecoderConfig): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: config.frameRateLimit, max: config.frameRateLimit },
    },
  };
}

const noopDecoderEventSink: DecoderEventSink = () => undefined;

function terminateWorkers(workers: readonly Worker[]): void {
  for (const worker of workers) {
    worker.terminate();
  }
}

function reportFrameLoopStartError(onEvent: DecoderEventSink, error: unknown): void {
  onEvent({
    kind: "error",
    message: error instanceof Error ? error.message : "Cimbar decoder failed to start.",
    recovery: "Stop scanning, reload the page, then start again.",
  });
}

/* v8 ignore stop */

export function createCameraDecoderAdapter(
  canDecode: boolean,
  videoProvider: VideoProvider = () => null,
  onEvent: DecoderEventSink = noopDecoderEventSink,
): DecoderAdapter {
  let stream: MediaStream | null = null;
  let workers: Worker[] = [];
  let workerIndex = 0;
  let module: CimbarDecoderModule | undefined;
  let fountainBuffer: Uint8Array | undefined;
  let stopped = true;
  let framesInFlight = 0;
  let diagnostics: DecodeDiagnostics = emptyDiagnostics;

  const updateDiagnostics = (patch: Partial<DecodeDiagnostics>) => {
    diagnostics = {
      ...diagnostics,
      ...patch,
      inFlightFrames: framesInFlight,
    };
    onEvent({ kind: "diagnostic", diagnostics });
  };

  const teardown = () => {
    stopped = true;
    terminateWorkers(workers);
    workers = [];
    framesInFlight = 0;
    diagnostics = { ...emptyDiagnostics };
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
  };

  /* v8 ignore start -- exercised in browser E2E with real worker and fake camera device. */
  const handleDecodedBytes = (data: Extract<WorkerMessage, { readonly buff: Uint8Array }>) => {
    if (!module || stopped || data.buff.byteLength === 0) {
      return;
    }
    if (data.mode > 0) {
      module._cimbard_configure_decode(data.mode);
    }
    updateDiagnostics({
      decodedFrames: diagnostics.decodedFrames + 1,
      lastWorkerMessage: `Extracted ${data.buff.byteLength} bytes from camera frame.`,
    });
    fountainBuffer = copyToReusableHeap(module, fountainBuffer, module._cimbard_get_bufsize());
    fountainBuffer.set(data.buff);
    const result = module._cimbard_fountain_decode(fountainBuffer.byteOffset, data.buff.byteLength);
    const report = readReport(module);
    if (Array.isArray(report)) {
      onEvent({ kind: "progress", streams: report });
    }
    const id = normalizeDecodeId(result);
    if (id === null) {
      return;
    }
    const size = module._cimbard_get_filesize(id) as ByteSize;
    const fileName = readFilename(module, id, size);
    const bytes = readDecodedBytes(module, id);
    onEvent({ kind: "complete", fileName, size, bytes });
    teardown();
  };

  const handleWorkerMessage = (event: MessageEvent<unknown>) => {
    framesInFlight = Math.max(0, framesInFlight - 1);
    const data = event.data;
    if (stopped) {
      return;
    }
    const parsed = parseWorkerMessage(data);
    switch (parsed.kind) {
      case "noData":
        updateDiagnostics({
          noDataFrames: diagnostics.noDataFrames + 1,
          lastWorkerMessage: "No Cimbar symbols detected in the last frame.",
        });
        return;
      case "failedExtract":
        updateDiagnostics({
          failedExtractFrames: diagnostics.failedExtractFrames + 1,
          lastWorkerMessage: "Symbols were detected, but extraction failed.",
        });
        return;
      case "decoded":
        handleDecodedBytes({ mode: parsed.mode, buff: parsed.bytes });
        return;
      case "error":
        updateDiagnostics({
          workerErrors: diagnostics.workerErrors + 1,
          lastWorkerMessage: parsed.message,
        });
        onEvent({
          kind: "error",
          message: parsed.message,
          recovery: "Stop scanning, check camera framing, then start again.",
        });
        return;
      case "ready":
      case "unknown":
        updateDiagnostics({
          lastWorkerMessage:
            parsed.kind === "unknown"
              ? "Ignored an unknown decoder worker message."
              : "Worker ready.",
        });
        return;
      default:
        return;
    }
  };

  const createWorkers = (count: number): readonly Promise<void>[] => {
    workers = Array.from({ length: count }, () => {
      const worker = new Worker(vendorAssetPath(cimbarVendorManifest.files.decoderWorker));
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (error) => {
        onEvent({
          kind: "error",
          message: error.message,
          recovery: "Stop scanning, reload the page, then start again.",
        });
      };
      return worker;
    });
    return workers.map(
      (worker) =>
        new Promise<void>((resolve) => {
          const previous = worker.onmessage;
          worker.onmessage = (event) => {
            if (isWorkerMessage(event.data) && "ready" in event.data) {
              worker.onmessage = previous;
              resolve();
              return;
            }
            previous?.call(worker, event);
          };
        }),
    );
  };

  let fallbackCanvas: HTMLCanvasElement | undefined;
  let fallbackContext: CanvasRenderingContext2D | null | undefined;

  const fallbackSurface = () => {
    fallbackCanvas ??= document.createElement("canvas");
    fallbackContext ??= fallbackCanvas.getContext("2d", { willReadFrequently: true });
    return fallbackContext ? { canvas: fallbackCanvas, context: fallbackContext } : null;
  };

  const postPixels = (
    pixels: Uint8Array,
    format: string,
    width: number,
    height: number,
    config: DecoderConfig,
  ) => {
    const configuredMode = modeValue(config.mode);
    const autoModes = [66, 68, 67, 4] as const;
    const mode =
      configuredMode > 0 ? configuredMode : (autoModes[workerIndex % autoModes.length] ?? 68);
    workers[workerIndex % workers.length]?.postMessage(
      { type: "proc", pixels, format, width, height, mode },
      [pixels.buffer],
    );
    workerIndex += 1;
    framesInFlight += 1;
    updateDiagnostics({
      postedFrames: diagnostics.postedFrames + 1,
      lastFrame: { width, height, format },
      lastWorkerMessage: "Frame posted to decoder worker.",
    });
  };

  const copyCanvasFrame = (video: HTMLVideoElement, config: DecoderConfig) => {
    const surface = fallbackSurface();
    if (!surface || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return;
    }
    updateDiagnostics({ sampledFrames: diagnostics.sampledFrames + 1 });
    if (surface.canvas.width !== video.videoWidth || surface.canvas.height !== video.videoHeight) {
      surface.canvas.width = video.videoWidth;
      surface.canvas.height = video.videoHeight;
    }
    surface.context.drawImage(video, 0, 0, surface.canvas.width, surface.canvas.height);
    const image = surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height);
    postPixels(
      new Uint8Array(image.data),
      "RGBA",
      surface.canvas.width,
      surface.canvas.height,
      config,
    );
  };

  const copyVideoFrame = (
    video: HTMLVideoElement,
    now: DOMHighResTimeStamp,
    config: DecoderConfig,
  ) => {
    if (typeof VideoFrame === "undefined") {
      copyCanvasFrame(video, config);
      return;
    }
    try {
      const frame = new VideoFrame(video, { timestamp: now });
      const width = frame.displayWidth;
      const height = frame.displayHeight;
      updateDiagnostics({ sampledFrames: diagnostics.sampledFrames + 1 });
      const params: VideoFrameCopyToOptions =
        config.preferNativeFormats && ["NV12", "I420"].includes(frame.format ?? "")
          ? {}
          : { format: "RGBA" };
      const size = frame.allocationSize(params);
      const pixels = new Uint8Array(size);
      frame.copyTo(pixels, params);
      const format = params.format ?? frame.format ?? "RGBA";
      postPixels(pixels, format, width, height, config);
      frame.close();
    } catch {
      copyCanvasFrame(video, config);
    }
  };

  const scheduleFrame = (video: HTMLVideoElement, config: DecoderConfig) => {
    if (stopped) {
      return;
    }
    const onFrame = (now: DOMHighResTimeStamp) => {
      if (stopped || workers.length === 0) {
        return;
      }
      if (framesInFlight <= 20) {
        try {
          copyVideoFrame(video, now, config);
        } catch (error) {
          onEvent({
            kind: "error",
            message: error instanceof Error ? error.message : "Failed to copy a camera frame.",
            recovery: "Try another browser or disable native camera formats.",
          });
        }
      }
      scheduleFrame(video, config);
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(onFrame);
      return;
    }
    window.setTimeout(() => onFrame(performance.now()), Math.max(1000 / config.frameRateLimit, 16));
  };

  const startFrameLoop = async (config: DecoderConfig) => {
    const video = videoProvider();
    if (!video) {
      return;
    }
    module = await ensureDecoderRuntime();
    const configuredMode = modeValue(config.mode);
    if (configuredMode > 0) {
      module._cimbard_configure_decode(configuredMode);
      fountainBuffer = copyToReusableHeap(module, fountainBuffer, module._cimbard_get_bufsize());
    }
    await Promise.all(createWorkers(config.workers));
    await video.play();
    scheduleFrame(video, config);
  };
  /* v8 ignore stop */

  return {
    async start(config) {
      if (!canDecode) {
        return {
          kind: "error",
          message: "Camera decode is not available in this browser.",
          recovery: "Use HTTPS, a browser with VideoFrame support, or scan with CFC Android.",
        };
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        return {
          kind: "error",
          message: "Camera access is not available in this browser.",
          recovery: "Use HTTPS or localhost in a browser with MediaDevices support.",
        };
      }
      try {
        teardown();
        stopped = false;
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(config));
        diagnostics = { ...emptyDiagnostics, camera: snapshotCameraTrack(stream) };
        updateDiagnostics({ camera: diagnostics.camera });
        const video = videoProvider();
        if (video) {
          video.srcObject = stream;
          startFrameLoop(config).catch(reportFrameLoopStartError.bind(null, onEvent));
        }
        return { kind: "camera-ready", stream, diagnostics };
      } catch (error) {
        stopped = true;
        return {
          kind: "error",
          message: error instanceof Error ? error.message : "Camera permission was denied.",
          recovery: "Allow camera access, then start scanning again.",
        };
      }
    },
    async stop() {
      teardown();
      return { kind: "progress", streams: [] };
    },
  };
}
