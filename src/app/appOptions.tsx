import { Camera, FileUp, Settings2 } from "lucide-react";
import type { EncodeMode, TransferPresetId } from "../domain/cimbar";
import type { DecodeModeOption, ParameterHelpId, WorkspaceTabOption } from "./appTypes";
import { i18n } from "./i18n";

export const workspaceTabs: readonly WorkspaceTabOption[] = [
  { id: "encode", label: i18n.workspace.encode, icon: <FileUp aria-hidden="true" /> },
  { id: "decode", label: i18n.workspace.decode, icon: <Camera aria-hidden="true" /> },
  { id: "settings", label: i18n.workspace.info, icon: <Settings2 aria-hidden="true" /> },
];

export const parameterHelp: Readonly<Record<ParameterHelpId, string>> = {
  "encode-mode": i18n.help.encodeMode,
  "encode-fps": i18n.help.encodeFps,
  "wake-lock": i18n.help.wakeLock,
  "color-balance": i18n.help.colorBalance,
  "fullscreen-target": i18n.help.fullscreenTarget,
  "fullscreen-margin": i18n.help.fullscreenMargin,
  redundancy: i18n.help.redundancy,
  "chunk-size": i18n.help.chunkSize,
  "encode-id-strategy": i18n.help.encodeIdStrategy,
  "encode-id-base": i18n.help.encodeIdBase,
  "decode-mode": i18n.help.decodeMode,
  "frame-limit": i18n.help.frameLimit,
  workers: i18n.help.workers,
  "auto-detect": i18n.help.autoDetect,
  "native-formats": i18n.help.nativeFormats,
};

export const encodeModeOptions: readonly {
  readonly id: EncodeMode;
  readonly label: string;
  readonly detail: string;
}[] = [
  { id: "b", label: "B", detail: i18n.modes.encode.b },
  { id: "bm", label: "Bm", detail: i18n.modes.encode.bm },
  { id: "bu", label: "Bu", detail: i18n.modes.encode.bu },
  { id: "4c", label: "4C", detail: i18n.modes.encode["4c"] },
];

export const decodeModeOptions: readonly DecodeModeOption[] = [
  { id: "auto", label: "Auto", detail: i18n.modes.decode.auto },
  { id: "b", label: "B", detail: i18n.modes.decode.b },
  { id: "bm", label: "Bm", detail: i18n.modes.decode.bm },
  { id: "bu", label: "Bu", detail: i18n.modes.decode.bu },
  { id: "4c", label: "4C", detail: i18n.modes.decode["4c"] },
];

export const presetOrigins: Readonly<Record<TransferPresetId, string>> = {
  balanced: i18n.presets.balanced,
  fast: i18n.presets.fast,
  robust: i18n.presets.robust,
  largeCareful: i18n.presets.largeCareful,
};
