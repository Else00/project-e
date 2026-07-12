import type { ByteSize, Percent } from "./scalars";

export type CapabilityStatus = "supported" | "degraded" | "unsupported";

export type CapabilityState =
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "ready"; status: CapabilityStatus; checks: readonly CapabilityCheck[] }>;

export type CapabilityCheck = Readonly<{
  id: string;
  label: string;
  ok: boolean;
  requiredFor: "encode" | "decode" | "both" | "optional";
  detail: string;
}>;

export type FileValidation =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "valid"; name: string; size: ByteSize; message: string }>
  | Readonly<{ kind: "warning"; name: string; size: ByteSize; message: string; recovery: string }>
  | Readonly<{ kind: "blocked"; name: string; size: ByteSize; message: string; recovery: string }>;

export type EncoderState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loadingWasm" }>
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "encoding"; fileName: string; progress: Percent }>
  | Readonly<{ kind: "rendering"; fileName: string; frame: number }>
  | Readonly<{ kind: "paused"; fileName: string; frame: number }>
  | Readonly<{ kind: "failed"; message: string }>;

export type DecoderState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "requestingCamera" }>
  | Readonly<{ kind: "scanning"; frames: number; diagnostics?: DecodeDiagnostics }>
  | Readonly<{
      kind: "decoding";
      streams: readonly DecodeProgress[];
      diagnostics?: DecodeDiagnostics;
    }>
  | Readonly<{ kind: "complete"; fileName: string; size: ByteSize }>
  | Readonly<{ kind: "failed"; message: string; recovery: string }>
  | Readonly<{ kind: "stopped" }>;

export type DecodeProgress = Readonly<{
  streamId: string;
  progress: Percent;
}>;

export type CameraTrackSnapshot = Readonly<{
  width: number | null;
  height: number | null;
  frameRate: number | null;
  facingMode: string | null;
  aspectRatio: number | null;
  resizeMode: string | null;
  supportsTorch: boolean;
  supportsZoom: boolean;
}>;

export type DecodeFrameSnapshot = Readonly<{
  width: number;
  height: number;
  format: string;
}>;

export type DecodeDiagnostics = Readonly<{
  sampledFrames: number;
  postedFrames: number;
  noDataFrames: number;
  failedExtractFrames: number;
  decodedFrames: number;
  workerErrors: number;
  inFlightFrames: number;
  lastFrame: DecodeFrameSnapshot | null;
  camera: CameraTrackSnapshot | null;
  lastWorkerMessage: string | null;
}>;

export type DownloadState =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "preparing"; fileName: string }>
  | Readonly<{ kind: "ready"; fileName: string; url: string }>
  | Readonly<{ kind: "failed"; message: string }>;
