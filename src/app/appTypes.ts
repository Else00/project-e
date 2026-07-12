import type { ReactNode } from "react";
import type { DecoderConfig } from "../domain/cimbar";
import type { Blake3Value, IntegrityHash } from "../features/bigfile/bigfileIntegrity";
import type {
  DecoderAdapter,
  DecoderEventSink,
  VideoProvider,
} from "../features/decoder/decoderAdapter";

export type AdvancedState = Readonly<{
  encoder: boolean;
  decoder: boolean;
  technical: boolean;
}>;

export type DecoderAdapterFactory = (
  canDecode: boolean,
  videoProvider: VideoProvider,
  onEvent: DecoderEventSink,
) => DecoderAdapter;

export type AppProps = Readonly<{
  createDecoderAdapter?: DecoderAdapterFactory;
}>;

export type DisplayMetrics = Readonly<{
  screenWidth: number;
  screenHeight: number;
  screenAspectRatio: number;
  physicalScreenWidth: number;
  physicalScreenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportAspectRatio: number;
  visualViewportWidth: number;
  visualViewportHeight: number;
  visualViewportAspectRatio: number;
  devicePixelRatio: number;
  refreshRateHz: number | null;
}>;

export type WorkspaceTab = "encode" | "decode" | "settings";

export type WorkspaceTabOption = Readonly<{
  id: WorkspaceTab;
  label: string;
  icon: ReactNode;
}>;

export type ParameterHelpId =
  | "encode-mode"
  | "encode-fps"
  | "wake-lock"
  | "color-balance"
  | "fullscreen-target"
  | "fullscreen-margin"
  | "redundancy"
  | "chunk-size"
  | "encode-id-strategy"
  | "encode-id-base"
  | "decode-mode"
  | "frame-limit"
  | "workers"
  | "auto-detect"
  | "native-formats";

export type ReassemblyIntegrityState =
  | Readonly<{ kind: "idle"; label: string; message: string }>
  | Readonly<{ kind: "missing"; label: string; message: string }>
  | Readonly<{ kind: "checking"; label: string; message: string }>
  | Readonly<{ kind: "verified"; label: string; message: string; hash: IntegrityHash }>
  | Readonly<{
      kind: "failed";
      label: string;
      message: string;
      expected: Blake3Value;
      actual: Blake3Value;
    }>;

export const initialReassemblyIntegrity: ReassemblyIntegrityState = {
  kind: "idle",
  label: "No transfer",
  message: "Integrity appears after a verified bigfile stream is scanned.",
};

export type DirectIntegrityState =
  | Readonly<{ kind: "idle"; label: string; message: string }>
  | Readonly<{ kind: "checking"; label: string; message: string }>
  | Readonly<{ kind: "verified"; label: string; message: string; hash: IntegrityHash }>
  | Readonly<{
      kind: "failed";
      label: string;
      message: string;
      expected?: Blake3Value;
      actual?: Blake3Value;
    }>;

export const initialDirectIntegrity: DirectIntegrityState = {
  kind: "idle",
  label: "No decode",
  message: "Direct decode integrity appears after a file is reconstructed.",
};

export type DecodeModeOption = Readonly<{
  id: DecoderConfig["mode"];
  label: string;
  detail: string;
}>;
