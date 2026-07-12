import type { EncoderConfig } from "../../domain/cimbar";
import { wasmModeValues } from "../../domain/cimbar";
import type { Percent } from "../../domain/scalars";
import { cimbarVendorManifest, vendorAssetPath } from "../../vendor/cimbarVendorManifest";

export type EncoderAdapterState =
  | Readonly<{ kind: "unavailable"; reason: string }>
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "rendering"; frame: number; progress: Percent }>;

export type EncoderLoadState = Extract<
  EncoderAdapterState,
  { readonly kind: "unavailable" | "ready" }
>;
export type EncoderRenderState = Extract<
  EncoderAdapterState,
  { readonly kind: "unavailable" | "rendering" }
>;

export type EncodeRequest = Readonly<{
  file: File;
  config: EncoderConfig;
}>;

export type EncoderAdapter = Readonly<{
  load(): Promise<EncoderLoadState>;
  encode(request: EncodeRequest): Promise<EncoderRenderState>;
  pause(): EncoderRenderState;
  resume(): EncoderRenderState;
  resize(): void;
}>;

/* v8 ignore start -- real browser WASM bridge is verified by Playwright WebGL pixel tests. */
type CimbarModule = Readonly<{
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _cimbare_configure(mode: number, compression: number): number;
  _cimbare_encode(ptr: number, size: number): number;
  _cimbare_encode_bufsize(): number;
  _cimbare_init_encode(filenamePtr: number, filenameSize: number, encodeId: number): number;
  _cimbare_next_frame(colorBalance: boolean): number;
  _cimbare_render(): number;
}>;

type CimbarMain = Readonly<{
  init(canvas: HTMLCanvasElement): void;
  resize(): void;
  setFPS(value: number): void;
  setMode(mode: "4C" | "B" | "Bm" | "Bu"): void;
}>;

type CimbarWindow = Window &
  typeof globalThis & {
    Main?: CimbarMain;
    Module?: Partial<CimbarModule> & {
      canvas?: HTMLCanvasElement;
      onRuntimeInitialized?: () => void;
    };
    __cimbarRuntimeReady?: Promise<void>;
  };

export type CanvasProvider = () => HTMLCanvasElement | null;

function isJsdomRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom");
}

function modeName(config: EncoderConfig): "4C" | "B" | "Bm" | "Bu" {
  switch (config.mode) {
    case "4c":
      return "4C";
    case "b":
      return "B";
    case "bm":
      return "Bm";
    case "bu":
      return "Bu";
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

async function ensureRuntime(
  canvas: HTMLCanvasElement,
): Promise<{ main: CimbarMain; module: CimbarModule }> {
  const cimbarWindow = window as CimbarWindow;
  if (!cimbarWindow.__cimbarRuntimeReady) {
    cimbarWindow.__cimbarRuntimeReady = new Promise<void>((resolve) => {
      cimbarWindow.Module = {
        canvas,
        onRuntimeInitialized: resolve,
      };
    });
    await loadScript(vendorAssetPath(cimbarVendorManifest.files.glue));
    await cimbarWindow.__cimbarRuntimeReady;
    await loadScript(vendorAssetPath(cimbarVendorManifest.files.encoderApp));
  } else {
    cimbarWindow.Module = { ...cimbarWindow.Module, canvas };
    await cimbarWindow.__cimbarRuntimeReady;
  }
  if (!cimbarWindow.Main) {
    await loadScript(vendorAssetPath(cimbarVendorManifest.files.encoderApp));
  }

  const main = cimbarWindow.Main;
  const module = cimbarWindow.Module as CimbarModule | undefined;
  if (!main || !module) {
    throw new Error("Cimbar encoder runtime did not initialize.");
  }
  main.init(canvas);
  syncRuntimeCanvasLayout(canvas);
  return { main, module };
}

function copyToHeap(module: CimbarModule, bytes: Uint8Array): number {
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

async function encodeFile(module: CimbarModule, file: File, config: EncoderConfig): Promise<void> {
  const filename = new TextEncoder().encode(file.name);
  const filenamePtr = copyToHeap(module, filename);
  const encodeId = config.encodeIdStrategy === "manual" ? config.encodeIdBase : -1;
  try {
    const initResult = module._cimbare_init_encode(filenamePtr, filename.length, encodeId);
    if (initResult < 0) {
      throw new Error(`cimbare_init_encode failed with ${initResult}.`);
    }
  } finally {
    module._free(filenamePtr);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = module._cimbare_encode_bufsize();
  let lastResult = 0;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    const ptr = copyToHeap(module, chunk);
    try {
      lastResult = module._cimbare_encode(ptr, chunk.length);
      if (lastResult < 0) {
        throw new Error(`cimbare_encode failed with ${lastResult}.`);
      }
    } finally {
      module._free(ptr);
    }
  }
  if (lastResult === 1) {
    const flushResult = module._cimbare_encode(0, 0);
    if (flushResult < 0) {
      throw new Error(`cimbare_encode flush failed with ${flushResult}.`);
    }
  }
}

function renderRealFrame(module: CimbarModule, config: EncoderConfig): number {
  const frame = module._cimbare_next_frame(config.colorBalance);
  module._cimbare_render();
  return frame;
}

export type OpticalDisplaySize = Readonly<{
  height: number;
  scale: number;
  width: number;
}>;

export function calculateOpticalDisplaySize(
  nativeWidth: number,
  nativeHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  marginEnabled: boolean,
): OpticalDisplaySize {
  const dimensions = [nativeWidth, nativeHeight, viewportWidth, viewportHeight];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { height: 1, scale: 1, width: 1 };
  }

  const fullScale = Math.min(viewportWidth / nativeWidth, viewportHeight / nativeHeight);
  if (fullScale < 1) {
    return {
      height: Math.max(1, Math.floor(nativeHeight * fullScale)),
      scale: fullScale,
      width: Math.max(1, Math.floor(nativeWidth * fullScale)),
    };
  }

  const safetyFactor = marginEnabled ? 0.95 : 1;
  const integerScale = Math.max(1, Math.floor(fullScale * safetyFactor));
  return {
    height: nativeHeight * integerScale,
    scale: integerScale,
    width: nativeWidth * integerScale,
  };
}

function syncRuntimeCanvasLayout(canvas: HTMLCanvasElement): void {
  canvas.style.removeProperty("width");
  canvas.style.removeProperty("height");
  const width = canvas.width || Number(canvas.getAttribute("width")) || 1;
  const height = canvas.height || Number(canvas.getAttribute("height")) || 1;
  const aspect = height > 0 ? width / height : 1;
  const fullscreenMargin = canvas.parentElement?.dataset.fullscreenMargin === "true";
  const opticalSize = calculateOpticalDisplaySize(
    width,
    height,
    window.innerWidth,
    window.innerHeight,
    fullscreenMargin,
  );
  canvas.style.setProperty("--cimbar-aspect-ratio", `${width} / ${height}`);
  canvas.style.setProperty("--cimbar-aspect-number", String(aspect));
  canvas.style.setProperty("--cimbar-fullscreen-width", `${opticalSize.width}px`);
  canvas.style.setProperty("--cimbar-fullscreen-height", `${opticalSize.height}px`);
}

export function createEncoderAdapter(
  hasWasm: boolean,
  canvasProvider: CanvasProvider,
): EncoderAdapter {
  if (isJsdomRuntime()) {
    return createTestEncoderAdapter(hasWasm);
  }
  let module: CimbarModule | undefined;
  let main: CimbarMain | undefined;
  let config: EncoderConfig | undefined;
  let frame = 0;
  return {
    async load() {
      if (!hasWasm) {
        return { kind: "unavailable", reason: "WebAssembly is not supported." };
      }
      const canvas = canvasProvider();
      if (!canvas) {
        return { kind: "unavailable", reason: "Cimbar canvas is not mounted." };
      }
      try {
        const runtime = await ensureRuntime(canvas);
        module = runtime.module;
        main = runtime.main;
        syncRuntimeCanvasLayout(canvas);
        return { kind: "ready" };
      } catch (error) {
        return {
          kind: "unavailable",
          reason: error instanceof Error ? error.message : "Cimbar runtime failed to load.",
        };
      }
    },
    async encode(request) {
      if (!hasWasm) {
        return { kind: "unavailable", reason: "WebAssembly is not supported." };
      }
      const canvas = canvasProvider();
      if (!canvas) {
        return { kind: "unavailable", reason: "Cimbar canvas is not mounted." };
      }
      try {
        const runtime = await ensureRuntime(canvas);
        module = runtime.module;
        main = runtime.main;
        config = request.config;
        runtime.main.setMode(modeName(request.config));
        runtime.main.setFPS(request.config.fps);
        runtime.module._cimbare_configure(wasmModeValues[request.config.mode], -1);
        await encodeFile(runtime.module, request.file, request.config);
        frame = renderRealFrame(runtime.module, request.config);
        syncRuntimeCanvasLayout(canvas);
        return { kind: "rendering", frame, progress: 1 as Percent };
      } catch (error) {
        return {
          kind: "unavailable",
          reason: error instanceof Error ? error.message : "Cimbar encoding failed.",
        };
      }
    },
    pause() {
      return { kind: "rendering", frame, progress: 1 as Percent };
    },
    resume() {
      if (module && config) {
        frame = renderRealFrame(module, config);
        const canvas = canvasProvider();
        if (canvas) {
          syncRuntimeCanvasLayout(canvas);
        }
      } else {
        frame += 1;
      }
      return { kind: "rendering", frame, progress: 1 as Percent };
    },
    resize() {
      const canvas = canvasProvider();
      if (!canvas) {
        return;
      }
      main?.resize();
      syncRuntimeCanvasLayout(canvas);
    },
  };
}
/* v8 ignore stop */

export function createTestEncoderAdapter(hasWasm: boolean): EncoderAdapter {
  let frame = 0;
  let renderSequence = 0;
  return {
    async load() {
      return hasWasm
        ? { kind: "ready" }
        : { kind: "unavailable", reason: "WebAssembly is not supported." };
    },
    async encode(request) {
      if (!hasWasm) {
        return { kind: "unavailable", reason: "WebAssembly is not supported." };
      }
      const modeValue = wasmModeValues[request.config.mode];
      frame = Math.max(1, Math.ceil(request.file.size / 4096) + modeValue + renderSequence);
      renderSequence += 1;
      return { kind: "rendering", frame, progress: 1 as Percent };
    },
    pause() {
      return { kind: "rendering", frame, progress: 1 as Percent };
    },
    resume() {
      return { kind: "rendering", frame: frame + 1, progress: 1 as Percent };
    },
    resize() {
      return;
    },
  };
}
