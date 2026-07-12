import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DecoderConfig,
  type EncoderConfig,
  type TransferPresetId,
  createTransferPresets,
  evaluateDecoderConfig,
  evaluateEncoderConfig,
} from "../domain/cimbar";
import type { DecoderState, DownloadState, EncoderState } from "../domain/state";
import { unsafeByteSize } from "../domain/scalars";
import {
  activeChunk,
  bigfileEncoderConfig,
  createBigfilePlan,
  shouldUseNativeBigfile,
} from "../features/bigfile/bigfilePlan";
import {
  acceptDecodedBigfileEnvelope,
  emptyBigfileReassemblyState,
  type BigfileReassemblyState,
} from "../features/bigfile/bigfileReassembly";
import { normalizeBlake3 } from "../features/bigfile/bigfileIntegrity";
import {
  type DecoderAdapter,
  type DecoderAdapterEvent,
  createCameraDecoderAdapter,
} from "../features/decoder/decoderAdapter";
import { createEncoderAdapter } from "../features/encoder/encoderAdapter";
import { defaultTextFileName, textDraftToFile } from "../features/encoder/textInput";
import {
  type PreparedProtocolBigfile,
  decodeTransfer,
  encodeDirectFile,
  prepareBigfileTransfer,
} from "../features/protocol/transferProtocol";
import { validateFileForEncoding } from "../features/limits/filePolicy";
import {
  buildCapabilityChecks,
  readCapabilityEnvironment,
  summarizeCapability,
} from "../features/capabilities/capabilities";
import { AppHeader } from "./components/AppHeader";
import { DecodeWorkspace } from "./components/DecodeWorkspace";
import { EncodeWorkspace } from "./components/EncodeWorkspace";
import { InfoWorkspace } from "./components/InfoWorkspace";
import {
  bytesDownload,
  canDownloadReassembledFile,
  decoderProgressInfo,
  reassemblyProgressPercent,
} from "./appLogic";
import type {
  AdvancedState,
  AppProps,
  DecoderAdapterFactory,
  DirectIntegrityState,
  DisplayMetrics,
  ParameterHelpId,
  ReassemblyIntegrityState,
  WorkspaceTab,
} from "./appTypes";
import { initialDirectIntegrity, initialReassemblyIntegrity } from "./appTypes";
import "../styles/app.css";

function encoderDisabledReason(
  selectedFile: File | null,
  fileValidation: ReturnType<typeof validateFileForEncoding>,
  bigfilePlan: ReturnType<typeof createBigfilePlan>,
  hasErrors: boolean,
): string | null {
  if (!selectedFile) {
    return "Choose file first.";
  }
  if (bigfilePlan.kind === "blocked") {
    return bigfilePlan.recovery;
  }
  if (fileValidation.kind === "blocked" && bigfilePlan.kind !== "planned") {
    return `${fileValidation.message} ${fileValidation.recovery}`;
  }
  if (hasErrors) {
    return "Fix configuration errors before starting encode.";
  }
  return null;
}

function decoderDisabledReason(canDecode: boolean, hasErrors: boolean): string | null {
  if (!canDecode) {
    return "Browser capabilities are insufficient for camera decoding.";
  }
  if (hasErrors) {
    return "Fix decoder configuration errors before starting camera.";
  }
  return null;
}

function ratio(width: number, height: number): number {
  return height > 0 ? width / height : 1;
}

function readDisplayMetrics(refreshRateHz: number | null): DisplayMetrics {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const visualViewportWidth = window.visualViewport?.width ?? viewportWidth;
  const visualViewportHeight = window.visualViewport?.height ?? viewportHeight;
  const screenWidth = window.screen?.width || viewportWidth;
  const screenHeight = window.screen?.height || viewportHeight;
  const devicePixelRatio = window.devicePixelRatio || 1;
  return {
    screenWidth,
    screenHeight,
    screenAspectRatio: ratio(screenWidth, screenHeight),
    physicalScreenWidth: Math.round(screenWidth * devicePixelRatio),
    physicalScreenHeight: Math.round(screenHeight * devicePixelRatio),
    viewportWidth,
    viewportHeight,
    viewportAspectRatio: ratio(viewportWidth, viewportHeight),
    visualViewportWidth,
    visualViewportHeight,
    visualViewportAspectRatio: ratio(visualViewportWidth, visualViewportHeight),
    devicePixelRatio,
    refreshRateHz,
  };
}

export default function App({ createDecoderAdapter = createCameraDecoderAdapter }: AppProps) {
  const presets = useMemo(() => createTransferPresets(), []);
  const [presetId, setPresetId] = useState<TransferPresetId>("balanced");
  const activePreset = presets.find((preset) => preset.id === presetId) ?? presets[0];
  if (!activePreset) {
    throw new Error("Cimbar transfer presets must not be empty.");
  }

  const [encoderConfig, setEncoderConfig] = useState<EncoderConfig>(activePreset.encoder);
  const [decoderConfig, setDecoderConfig] = useState<DecoderConfig>(activePreset.decoder);
  const [advanced, setAdvanced] = useState<AdvancedState>({
    encoder: false,
    decoder: false,
    technical: true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [textFileName, setTextFileName] = useState(defaultTextFileName);
  const [bigfileChunkIndex, setBigfileChunkIndex] = useState(0);
  const [bigfileAutoConfiguredKey, setBigfileAutoConfiguredKey] = useState<string | null>(null);
  const [encoderState, setEncoderState] = useState<EncoderState>({ kind: "idle" });
  const [decoderState, setDecoderState] = useState<DecoderState>({ kind: "idle" });
  const [decoderStream, setDecoderStream] = useState<MediaStream | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({ kind: "none" });
  const [bigfileReassemblyState, setBigfileReassemblyState] = useState<BigfileReassemblyState>(
    emptyBigfileReassemblyState,
  );
  const [bigfileReassemblyDownload, setBigfileReassemblyDownload] = useState<DownloadState>({
    kind: "none",
  });
  const [bigfileReassemblyError, setBigfileReassemblyError] = useState<string | null>(null);
  const [bigfileIntegrity, setBigfileIntegrity] = useState<ReassemblyIntegrityState>(
    initialReassemblyIntegrity,
  );
  const [directIntegrity, setDirectIntegrity] =
    useState<DirectIntegrityState>(initialDirectIntegrity);
  const [displayMetrics, setDisplayMetrics] = useState<DisplayMetrics>(() =>
    readDisplayMetrics(null),
  );
  const [refreshRateHz, setRefreshRateHz] = useState<number | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("encode");
  const [activeHelp, setActiveHelp] = useState<ParameterHelpId | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const senderFullscreenRef = useRef<HTMLDivElement>(null);
  const runtimeCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const decoderStreamRef = useRef<MediaStream | null>(null);
  const bigfileReassemblyStateRef = useRef<BigfileReassemblyState>(bigfileReassemblyState);
  const preparedBigfileRef = useRef<{
    key: string;
    value: PreparedProtocolBigfile;
  } | null>(null);
  const lastEncodedKeyRef = useRef<string | null>(null);

  const capabilityChecks = useMemo(
    () => buildCapabilityChecks(readCapabilityEnvironment(window)),
    [],
  );
  const capabilityState = useMemo(() => summarizeCapability(capabilityChecks), [capabilityChecks]);
  const hasWasm = capabilityChecks.find((check) => check.id === "wasm")?.ok ?? false;
  const canDecode = capabilityChecks.every(
    (check) => check.requiredFor === "optional" || check.requiredFor === "encode" || check.ok,
  );
  const fileValidation = validateFileForEncoding(selectedFile);
  const encoderIssues = evaluateEncoderConfig(encoderConfig);
  const decoderIssues = evaluateDecoderConfig(decoderConfig);
  const encoderHasErrors = encoderIssues.some((issue) => issue.severity === "error");
  const decoderHasErrors = decoderIssues.some((issue) => issue.severity === "error");
  const bigfilePlan = createBigfilePlan(selectedFile, encoderConfig);
  const nativeBigfileActive = bigfilePlan.kind === "planned";
  const nativeBigfileChunkCount = nativeBigfileActive ? bigfilePlan.chunkCount + 1 : 0;
  const activeBigfileChunk =
    nativeBigfileActive && bigfileChunkIndex > 0
      ? activeChunk(bigfilePlan, bigfileChunkIndex - 1)
      : null;
  const selectedFileKey = selectedFile
    ? `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`
    : null;
  const encodeRequestKey = selectedFileKey
    ? [
        selectedFileKey,
        nativeBigfileActive ? bigfileChunkIndex : "direct",
        encoderConfig.mode,
        encoderConfig.fps,
        encoderConfig.redundancy,
        encoderConfig.chunkSize,
        encoderConfig.colorBalance,
        encoderConfig.encodeIdStrategy,
        encoderConfig.encodeIdBase,
      ].join(":")
    : null;
  const bigfilePreparationKey = selectedFileKey
    ? `${selectedFileKey}:${encoderConfig.chunkSize}`
    : null;
  const canStopDecode =
    decoderState.kind === "requestingCamera" ||
    decoderState.kind === "scanning" ||
    decoderState.kind === "decoding";
  const encoderActionLabel =
    encoderState.kind === "paused"
      ? "Resume frames"
      : nativeBigfileActive
        ? bigfileChunkIndex === 0
          ? "Render manifest"
          : "Render current chunk"
        : "Render frames";
  const canPauseEncoder = encoderState.kind === "rendering";
  const encoderStartReason =
    encoderState.kind === "loadingWasm" || encoderState.kind === "paused"
      ? null
      : encoderDisabledReason(selectedFile, fileValidation, bigfilePlan, encoderHasErrors);
  const canRunEncoder =
    encoderState.kind === "paused" ||
    (encoderState.kind !== "loadingWasm" && encoderStartReason === null);
  const decoderStartReason = canStopDecode
    ? null
    : decoderDisabledReason(canDecode, decoderHasErrors);
  const canRunDecoder = !canStopDecode && decoderStartReason === null;
  const decoderProgress = decoderProgressInfo(decoderState);
  const reassemblyProgress = reassemblyProgressPercent(bigfileReassemblyState);
  const canDownloadReassembled = canDownloadReassembledFile(
    bigfileReassemblyDownload,
    bigfileIntegrity,
  );

  const encoderAdapter = useMemo(
    () => createEncoderAdapter(hasWasm, () => runtimeCanvasRef.current),
    [hasWasm],
  );

  const updateDisplayMetrics = useCallback(() => {
    setDisplayMetrics(readDisplayMetrics(refreshRateHz));
  }, [refreshRateHz]);

  const processDecodedComplete = useCallback(
    async (event: Extract<DecoderAdapterEvent, { readonly kind: "complete" }>) => {
      const bytes = new Uint8Array(event.bytes);
      setDirectIntegrity({
        kind: "checking",
        label: "Checking",
        message: "Checking direct transfer envelope.",
      });
      const envelope = decodeTransfer(bytes);
      if (envelope.kind === "err") {
        setDirectIntegrity({
          kind: "failed",
          label: "Rejected",
          message: `${envelope.error.message} ${envelope.error.recovery}`,
        });
        setDownloadState((current) => {
          if (current.kind === "ready") {
            URL.revokeObjectURL(current.url);
          }
          return { kind: "none" };
        });
        setDecoderStream(null);
        setDecoderState({ kind: "complete", fileName: event.fileName, size: event.size });
        return;
      }
      if (envelope.value.transfer.kind !== "direct") {
        const reassembly = acceptDecodedBigfileEnvelope(
          bigfileReassemblyStateRef.current,
          envelope.value,
        );
        if (reassembly.kind === "err") {
          setBigfileReassemblyError(`${reassembly.message} ${reassembly.recovery}`);
          setDirectIntegrity(initialDirectIntegrity);
          setDecoderStream(null);
          setDecoderState({ kind: "complete", fileName: event.fileName, size: event.size });
          return;
        }
        bigfileReassemblyStateRef.current = reassembly.state;
        setBigfileReassemblyState(reassembly.state);
        setBigfileReassemblyError(null);
        if (reassembly.state.kind === "empty") {
          setBigfileReassemblyError(
            "The verified transfer did not initialize the bigfile collector.",
          );
          return;
        }
        setDirectIntegrity(initialDirectIntegrity);
        setDownloadState((current) => {
          if (current.kind === "ready") URL.revokeObjectURL(current.url);
          return { kind: "none" };
        });
        if (reassembly.state.kind === "complete") {
          const ready = bytesDownload(reassembly.state.fileName, reassembly.state.bytes);
          setBigfileReassemblyDownload((current) => {
            if (current.kind === "ready") URL.revokeObjectURL(current.url);
            return ready;
          });
          const finalHash = reassembly.state.manifest
            ? normalizeBlake3(reassembly.state.manifest.file.blake3)
            : null;
          setBigfileIntegrity(
            finalHash?.kind === "ok"
              ? {
                  kind: "verified",
                  label: "Verified",
                  message: "All chunks and the final project-e.transfer BLAKE3 are verified.",
                  hash: finalHash.hash,
                }
              : initialReassemblyIntegrity,
          );
        } else {
          setBigfileIntegrity(initialReassemblyIntegrity);
        }
        setDecoderStream(null);
        setDecoderState({
          kind: "complete",
          fileName:
            envelope.value.transfer.kind === "bigfileManifest"
              ? `${reassembly.state.fileName} · manifest`
              : `${reassembly.state.fileName} · chunk ${envelope.value.transfer.number}/${envelope.value.transfer.chunkCount}`,
          size: unsafeByteSize(envelope.value.payload.byteLength),
        });
        return;
      }
      const hash = normalizeBlake3(envelope.value.transfer.content.blake3);
      if (hash.kind === "err") {
        setDirectIntegrity({ kind: "failed", label: "Rejected", message: hash.message });
        return;
      }
      const fileName =
        envelope.value.transfer.content.fileName ??
        `project-e-${envelope.value.transfer.transferId.slice(0, 12)}.bin`;
      setDirectIntegrity({
        kind: "verified",
        label: "Verified",
        message: "project-e.transfer v1 BLAKE3 verified.",
        hash: hash.hash,
      });
      const ready = bytesDownload(fileName, envelope.value.payload);
      setDownloadState((current) => {
        if (current.kind === "ready") {
          URL.revokeObjectURL(current.url);
        }
        return ready;
      });
      setDecoderStream(null);
      setDecoderState({
        kind: "complete",
        fileName,
        size: unsafeByteSize(envelope.value.payload.byteLength),
      });
    },
    [],
  );

  const handleDecoderEvent = useCallback(
    (event: DecoderAdapterEvent) => {
      if (event.kind === "diagnostic") {
        setDecoderState((current) => {
          if (current.kind === "requestingCamera" || current.kind === "scanning") {
            return {
              kind: "scanning",
              frames: event.diagnostics.sampledFrames,
              diagnostics: event.diagnostics,
            };
          }
          if (current.kind === "decoding") {
            return { ...current, diagnostics: event.diagnostics };
          }
          return current;
        });
        return;
      }
      if (event.kind === "progress") {
        setDecoderState((current) => {
          const diagnostics =
            current.kind === "scanning" || current.kind === "decoding"
              ? current.diagnostics
              : undefined;
          return diagnostics
            ? { kind: "decoding", streams: event.streams, diagnostics }
            : { kind: "decoding", streams: event.streams };
        });
        return;
      }
      if (event.kind === "error") {
        setDecoderState({ kind: "failed", message: event.message, recovery: event.recovery });
        return;
      }
      if (event.kind === "complete") {
        void processDecodedComplete(event);
      }
    },
    [processDecodedComplete],
  );

  const decoderAdapter = useMemo<DecoderAdapter>(
    () =>
      (createDecoderAdapter as DecoderAdapterFactory)(
        canDecode,
        () => cameraVideoRef.current,
        handleDecoderEvent,
      ),
    [canDecode, createDecoderAdapter, handleDecoderEvent],
  );

  useEffect(() => {
    let frameId = 0;
    const samples: number[] = [];
    let previous = performance.now();
    const sample = (now: number) => {
      const delta = now - previous;
      previous = now;
      if (delta > 0) {
        samples.push(delta);
      }
      if (samples.length >= 24) {
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const nextRefreshRate = Math.round(1000 / average);
        setRefreshRateHz(nextRefreshRate);
        setDisplayMetrics(readDisplayMetrics(nextRefreshRate));
        return;
      }
      frameId = window.requestAnimationFrame(sample);
    };
    frameId = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    decoderStreamRef.current = decoderStream;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = decoderStream;
    }
  }, [decoderStream]);

  useEffect(() => {
    bigfileReassemblyStateRef.current = bigfileReassemblyState;
  }, [bigfileReassemblyState]);

  useEffect(() => {
    const resize = () =>
      window.requestAnimationFrame(() => {
        encoderAdapter.resize();
        updateDisplayMetrics();
      });
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        resize();
      }
    };
    window.addEventListener("resize", resize);
    window.addEventListener("focus", resize);
    window.addEventListener("pageshow", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.screen.orientation?.addEventListener("change", resize);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    document.addEventListener("fullscreenchange", resize);
    resize();
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("focus", resize);
      window.removeEventListener("pageshow", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.screen.orientation?.removeEventListener("change", resize);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      document.removeEventListener("fullscreenchange", resize);
    };
  }, [encoderAdapter, updateDisplayMetrics]);

  useEffect(() => {
    return () => {
      for (const track of decoderStreamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (downloadState.kind === "ready") {
        URL.revokeObjectURL(downloadState.url);
      }
    };
  }, [downloadState]);

  useEffect(() => {
    return () => {
      if (bigfileReassemblyDownload.kind === "ready") {
        URL.revokeObjectURL(bigfileReassemblyDownload.url);
      }
    };
  }, [bigfileReassemblyDownload]);

  useEffect(() => {
    if (encoderState.kind !== "rendering") {
      return;
    }
    const intervalMs = Math.max(1000 / encoderConfig.fps, 33);
    const intervalId = window.setInterval(() => {
      const result = encoderAdapter.resume();
      if (result.kind === "unavailable") {
        setEncoderState({ kind: "failed", message: result.reason });
        return;
      }
      updateDisplayMetrics();
      setEncoderState((current) =>
        current.kind === "rendering"
          ? { kind: "rendering", fileName: current.fileName, frame: result.frame }
          : current,
      );
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [encoderAdapter, encoderConfig.fps, encoderState.kind, updateDisplayMetrics]);

  useEffect(() => {
    if (!selectedFile || !selectedFileKey || !shouldUseNativeBigfile(selectedFile)) {
      return;
    }
    if (bigfileAutoConfiguredKey === selectedFileKey) {
      return;
    }
    setPresetId("largeCareful");
    setEncoderConfig((current) => bigfileEncoderConfig(current, selectedFile));
    setAdvanced((current) => ({ ...current, encoder: true }));
    setBigfileAutoConfiguredKey(selectedFileKey);
  }, [bigfileAutoConfiguredKey, selectedFile, selectedFileKey]);

  const applyPresetConfig = (id: TransferPresetId, file: File | null) => {
    const next = presets.find((preset) => preset.id === id) ?? activePreset;
    setPresetId(id);
    setDecoderConfig(next.decoder);
    setEncoderConfig(
      file && shouldUseNativeBigfile(file)
        ? bigfileEncoderConfig(next.encoder, file)
        : next.encoder,
    );
  };

  const selectPreset = (id: TransferPresetId) => applyPresetConfig(id, selectedFile);

  const selectEncodeFile = (file: File | null) => {
    setSelectedFile(file);
    setEncoderState({ kind: "idle" });
    setBigfileChunkIndex(0);
    preparedBigfileRef.current = null;
    lastEncodedKeyRef.current = null;
  };

  const useTextInput = () => {
    const result = textDraftToFile({ text: textDraft, fileName: textFileName });
    /* v8 ignore next -- the UI disables this action while the text draft is empty. */
    if (result.kind === "err") {
      setEncoderState({ kind: "failed", message: `${result.message} ${result.recovery}` });
      return;
    }
    selectEncodeFile(result.file);
  };

  const requestPreviewFullscreen = useCallback(async () => {
    const node = senderFullscreenRef.current;
    if (!node) {
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  }, []);

  const runEncode = useCallback(async () => {
    if (!canRunEncoder) {
      return;
    }
    if (encoderConfig.fullscreen && !document.fullscreenElement) {
      void requestPreviewFullscreen().catch(() => undefined);
    }
    if (encoderState.kind === "paused") {
      const result = encoderAdapter.resume();
      if (result.kind === "rendering" && selectedFile) {
        updateDisplayMetrics();
        setEncoderState({ kind: "rendering", fileName: selectedFile.name, frame: result.frame });
        return;
      }
    }
    if (!selectedFile) {
      return;
    }
    let protocolFile: File;
    let configToEncode = encoderConfig;
    let encodedFileName = selectedFile.name;
    if (nativeBigfileActive && bigfilePlan.kind === "planned" && bigfilePreparationKey) {
      let prepared =
        preparedBigfileRef.current?.key === bigfilePreparationKey
          ? preparedBigfileRef.current.value
          : null;
      if (!prepared) {
        const result = await prepareBigfileTransfer(selectedFile, bigfilePlan);
        if (result.kind === "err") {
          setEncoderState({
            kind: "failed",
            message: `${result.error.message} ${result.error.recovery}`,
          });
          return;
        }
        prepared = result.value;
        preparedBigfileRef.current = { key: bigfilePreparationKey, value: prepared };
      }
      const stream = prepared.streams[bigfileChunkIndex];
      if (!stream) {
        setEncoderState({ kind: "failed", message: "The selected bigfile stream is unavailable." });
        return;
      }
      protocolFile = stream.file;
      configToEncode = {
        ...encoderConfig,
        encodeIdStrategy: "manual" as const,
        encodeIdBase: stream.encodeId,
      };
      encodedFileName = stream.label;
    } else {
      const protocolEnvelope = await encodeDirectFile(selectedFile);
      if (protocolEnvelope.kind === "err") {
        setEncoderState({
          kind: "failed",
          message: `${protocolEnvelope.error.message} ${protocolEnvelope.error.recovery}`,
        });
        return;
      }
      protocolFile = protocolEnvelope.value;
    }
    setEncoderState({ kind: "loadingWasm" });
    const loaded = await encoderAdapter.load();
    if (loaded.kind === "unavailable") {
      setEncoderState({ kind: "failed", message: loaded.reason });
      return;
    }
    const result = await encoderAdapter.encode({
      file: protocolFile,
      config: configToEncode,
    });
    if (result.kind === "rendering") {
      lastEncodedKeyRef.current = encodeRequestKey;
      updateDisplayMetrics();
      setEncoderState({ kind: "rendering", fileName: encodedFileName, frame: result.frame });
      return;
    }
    setEncoderState({ kind: "failed", message: result.reason });
  }, [
    bigfilePlan,
    bigfileChunkIndex,
    bigfilePreparationKey,
    canRunEncoder,
    encodeRequestKey,
    encoderAdapter,
    encoderConfig,
    encoderState.kind,
    nativeBigfileActive,
    requestPreviewFullscreen,
    selectedFile,
    updateDisplayMetrics,
  ]);

  useEffect(() => {
    if (!encodeRequestKey || !selectedFile || encoderState.kind !== "rendering") {
      return;
    }
    if (lastEncodedKeyRef.current === encodeRequestKey || !canRunEncoder) {
      return;
    }
    void runEncode();
  }, [canRunEncoder, encodeRequestKey, encoderState.kind, runEncode, selectedFile]);

  const pauseEncode = () => {
    const result = encoderAdapter.pause();
    setEncoderState((state) =>
      state.kind === "rendering" && result.kind === "rendering"
        ? { kind: "paused", fileName: state.fileName, frame: result.frame }
        : state,
    );
  };

  const toggleHelp = (id: ParameterHelpId) => {
    setActiveHelp((current) => (current === id ? null : id));
  };

  const startDecode = async () => {
    if (!canRunDecoder) {
      return;
    }
    setDirectIntegrity(initialDirectIntegrity);
    setDownloadState((current) => {
      if (current.kind === "ready") {
        URL.revokeObjectURL(current.url);
      }
      return { kind: "none" };
    });
    setDecoderState({ kind: "requestingCamera" });
    const result = await decoderAdapter.start(decoderConfig);
    if (result.kind === "camera-ready") {
      setDecoderStream(result.stream);
      setDecoderState(
        result.diagnostics
          ? {
              kind: "scanning",
              frames: result.diagnostics.sampledFrames,
              diagnostics: result.diagnostics,
            }
          : { kind: "scanning", frames: 0 },
      );
      return;
    }
    if (result.kind === "error") {
      setDecoderState({ kind: "failed", message: result.message, recovery: result.recovery });
      return;
    }
    if (result.kind === "progress") {
      setDecoderState({ kind: "decoding", streams: result.streams });
      return;
    }
    if (result.kind === "diagnostic") {
      setDecoderState({
        kind: "scanning",
        frames: result.diagnostics.sampledFrames,
        diagnostics: result.diagnostics,
      });
      return;
    }
    if (result.kind === "complete") {
      setDecoderState({ kind: "complete", fileName: result.fileName, size: result.size });
    }
  };

  const stopDecode = async () => {
    await decoderAdapter.stop();
    setDecoderStream(null);
    setDownloadState((current) => {
      if (current.kind === "ready") {
        URL.revokeObjectURL(current.url);
      }
      return { kind: "none" };
    });
    setDecoderState({ kind: "stopped" });
  };

  return (
    <main className="workbench" data-theme="dark">
      <AppHeader
        activeWorkspaceTab={activeWorkspaceTab}
        capabilityState={capabilityState}
        onSelectWorkspace={setActiveWorkspaceTab}
      />

      {activeWorkspaceTab === "encode" ? (
        <EncodeWorkspace
          activeBigfileChunk={activeBigfileChunk}
          bigfileStreamIndex={bigfileChunkIndex}
          activeHelp={activeHelp}
          activePreset={activePreset}
          advanced={advanced}
          bigfilePlan={bigfilePlan}
          canPauseEncoder={canPauseEncoder}
          canRunEncoder={canRunEncoder}
          encoderActionLabel={encoderActionLabel}
          encoderConfig={encoderConfig}
          encoderIssues={encoderIssues}
          encoderState={encoderState}
          fileInputRef={fileInputRef}
          fileValidation={fileValidation}
          nativeBigfileChunkCount={nativeBigfileChunkCount}
          presets={presets}
          runtimeCanvasRef={runtimeCanvasRef}
          selectedFile={selectedFile}
          senderFullscreenRef={senderFullscreenRef}
          startDisabledReason={encoderStartReason}
          textDraft={textDraft}
          textFileName={textFileName}
          onPauseEncode={pauseEncode}
          onRequestFullscreen={() => void requestPreviewFullscreen()}
          onRunEncode={() => void runEncode()}
          onSelectFile={selectEncodeFile}
          onSelectPreset={selectPreset}
          onSetAdvanced={setAdvanced}
          onSetBigfileChunkIndex={setBigfileChunkIndex}
          onSetEncoderConfig={setEncoderConfig}
          onSetTextDraft={setTextDraft}
          onSetTextFileName={setTextFileName}
          onToggleHelp={toggleHelp}
          onUseTextInput={useTextInput}
        />
      ) : activeWorkspaceTab === "decode" ? (
        <DecodeWorkspace
          activeHelp={activeHelp}
          advanced={advanced}
          bigfileIntegrity={bigfileIntegrity}
          bigfileReassemblyDownload={bigfileReassemblyDownload}
          bigfileReassemblyError={bigfileReassemblyError}
          bigfileReassemblyState={bigfileReassemblyState}
          cameraVideoRef={cameraVideoRef}
          canDownloadReassembled={canDownloadReassembled}
          canRunDecoder={canRunDecoder}
          canStopDecode={canStopDecode}
          decoderConfig={decoderConfig}
          decoderIssues={decoderIssues}
          decoderProgress={decoderProgress}
          decoderStartReason={decoderStartReason}
          decoderState={decoderState}
          decoderStream={decoderStream}
          directIntegrity={directIntegrity}
          downloadState={downloadState}
          reassemblyProgress={reassemblyProgress}
          onSetAdvanced={setAdvanced}
          onSetDecoderConfig={setDecoderConfig}
          onStartDecode={() => void startDecode()}
          onStopDecode={() => void stopDecode()}
          onToggleHelp={toggleHelp}
        />
      ) : (
        <InfoWorkspace
          advanced={advanced}
          capabilityChecks={capabilityChecks}
          displayMetrics={displayMetrics}
          onSetAdvanced={setAdvanced}
        />
      )}
    </main>
  );
}
