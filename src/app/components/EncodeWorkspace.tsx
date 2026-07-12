import {
  AlertTriangle,
  BatteryCharging,
  ChevronDown,
  Check,
  FileUp,
  FileText,
  Gauge,
  Maximize2,
  Palette,
  Pause,
  Play,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import type { RefObject } from "react";
import type {
  ConfigIssue,
  EncoderConfig,
  TransferPreset,
  TransferPresetId,
} from "../../domain/cimbar";
import { scalarBounds } from "../../domain/scalars";
import type { EncoderState, FileValidation } from "../../domain/state";
import { formatBytes } from "../../domain/validators";
import type { BigfileChunk, BigfilePlan } from "../../features/bigfile/bigfilePlan";
import { shouldUseNativeBigfile } from "../../features/bigfile/bigfilePlan";
import { encodeModeOptions, parameterHelp, presetOrigins } from "../appOptions";
import {
  estimateChunks,
  estimateTransferMinutes,
  fileValidationTone,
  validationMessage,
  updateEncoderNumber,
} from "../appLogic";
import type { AdvancedState, ParameterHelpId } from "../appTypes";
import { i18n } from "../i18n";
import { IssueList, ParameterHelp, ParameterLabel } from "../uiPrimitives";
import { NumberInput } from "./NumberInput";
import { SenderPreview } from "./SenderPreview";

type EncodeWorkspaceProps = Readonly<{
  activeBigfileChunk: BigfileChunk | null;
  bigfileStreamIndex: number;
  activeHelp: ParameterHelpId | null;
  activePreset: TransferPreset;
  advanced: AdvancedState;
  bigfilePlan: BigfilePlan;
  canPauseEncoder: boolean;
  canRunEncoder: boolean;
  encoderActionLabel: string;
  encoderConfig: EncoderConfig;
  encoderIssues: readonly ConfigIssue[];
  encoderState: EncoderState;
  fileInputRef: RefObject<HTMLInputElement | null>;
  fileValidation: FileValidation;
  nativeBigfileChunkCount: number;
  presets: readonly TransferPreset[];
  runtimeCanvasRef: RefObject<HTMLCanvasElement | null>;
  selectedFile: File | null;
  senderFullscreenRef: RefObject<HTMLDivElement | null>;
  startDisabledReason: string | null;
  textDraft: string;
  textFileName: string;
  onPauseEncode: () => void;
  onRequestFullscreen: () => void;
  onRunEncode: () => void;
  onSelectFile: (file: File | null) => void;
  onSelectPreset: (id: TransferPresetId) => void;
  onSetAdvanced: (advanced: AdvancedState) => void;
  onSetBigfileChunkIndex: (next: (current: number) => number) => void;
  onSetEncoderConfig: (config: EncoderConfig) => void;
  onSetTextDraft: (text: string) => void;
  onSetTextFileName: (fileName: string) => void;
  onToggleHelp: (id: ParameterHelpId) => void;
  onUseTextInput: () => void;
}>;

function bigfileSummary(plan: BigfilePlan): string {
  if (plan.kind === "empty") {
    return "";
  }
  if (plan.kind === "blocked") {
    return plan.recovery;
  }
  if (plan.kind === "planned") {
    return `${i18n.encode.plannedBigfile} ${plan.chunkCount} chunks.`;
  }
  return i18n.encode.directPlan;
}

function presetIcon(id: TransferPresetId) {
  switch (id) {
    case "balanced":
      return <Gauge aria-hidden="true" />;
    case "fast":
      return <Zap aria-hidden="true" />;
    case "robust":
      return <ShieldCheck aria-hidden="true" />;
    case "largeCareful":
      return <RadioTower aria-hidden="true" />;
  }
}

export function EncodeWorkspace({
  activeBigfileChunk,
  bigfileStreamIndex,
  activeHelp,
  activePreset,
  advanced,
  bigfilePlan,
  canPauseEncoder,
  canRunEncoder,
  encoderActionLabel,
  encoderConfig,
  encoderIssues,
  encoderState,
  fileInputRef,
  fileValidation,
  nativeBigfileChunkCount,
  presets,
  runtimeCanvasRef,
  selectedFile,
  senderFullscreenRef,
  startDisabledReason,
  textDraft,
  textFileName,
  onPauseEncode,
  onRequestFullscreen,
  onRunEncode,
  onSelectFile,
  onSelectPreset,
  onSetAdvanced,
  onSetBigfileChunkIndex,
  onSetEncoderConfig,
  onSetTextDraft,
  onSetTextFileName,
  onToggleHelp,
  onUseTextInput,
}: EncodeWorkspaceProps) {
  const chunks = estimateChunks(fileValidation, encoderConfig);
  const estimate = estimateTransferMinutes(fileValidation, encoderConfig);
  const fileIsLarge = shouldUseNativeBigfile(selectedFile);
  const showStartReason = Boolean(startDisabledReason && selectedFile);
  const textInputDisabled = textDraft.trim().length === 0;

  return (
    <section className="workspace-view" aria-label="Encode workspace">
      <section className="preset-strip" aria-label="Transfer presets">
        {presets.map((preset) => (
          <button
            className="preset-button"
            data-active={preset.id === activePreset.id}
            key={preset.id}
            onClick={() => onSelectPreset(preset.id)}
            title={presetOrigins[preset.id]}
            type="button"
          >
            {presetIcon(preset.id)}
            <strong>{preset.name}</strong>
            <span>{preset.bestFor}</span>
          </button>
        ))}
      </section>

      <section className="workspace-grid">
        <section className="panel encoder-panel" aria-labelledby="encoder-title">
          <div className="panel-heading">
            <div>
              <h2 id="encoder-title">{i18n.encode.title}</h2>
              <p>{i18n.encode.intro}</p>
            </div>
            <FileUp aria-hidden="true" />
          </div>

          <button
            className="dropzone"
            data-tone={fileValidationTone(fileValidation)}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <input
              aria-label="Choose file to encode"
              hidden
              onChange={(event) => onSelectFile(event.currentTarget.files?.[0] ?? null)}
              ref={fileInputRef}
              type="file"
            />
            <FileUp aria-hidden="true" />
            <span>{selectedFile ? selectedFile.name : i18n.encode.chooseFile}</span>
            <small>{validationMessage(fileValidation)}</small>
          </button>

          <section className="text-input-panel" aria-label="Text input">
            <div className="text-input-heading">
              <FileText aria-hidden="true" />
              <div>
                <strong>{i18n.encode.textInput}</strong>
                <span>{i18n.encode.textInputDetail}</span>
              </div>
            </div>
            <textarea
              aria-label="Text to encode"
              onChange={(event) => onSetTextDraft(event.currentTarget.value)}
              placeholder={i18n.encode.textInputPlaceholder}
              value={textDraft}
            />
            <div className="text-input-actions">
              <label>
                {i18n.encode.textFileName}
                <input
                  aria-label="Text file name"
                  onChange={(event) => onSetTextFileName(event.currentTarget.value)}
                  type="text"
                  value={textFileName}
                />
              </label>
              <button
                className="secondary-action"
                disabled={textInputDisabled}
                onClick={onUseTextInput}
                type="button"
              >
                <FileText aria-hidden="true" />
                {i18n.encode.useText}
              </button>
            </div>
          </section>

          {selectedFile &&
          bigfilePlan.kind !== "empty" &&
          bigfilePlan.kind !== "direct-preferred" ? (
            <div className="transfer-plan" data-kind={bigfilePlan.kind}>
              {bigfilePlan.kind === "blocked" ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <RadioTower aria-hidden="true" />
              )}
              <div>
                <strong>{bigfilePlan.kind}</strong>
                <span>{bigfileSummary(bigfilePlan)}</span>
              </div>
            </div>
          ) : null}

          {nativeBigfileChunkCount > 0 ? (
            <fieldset className="chunk-strip">
              <legend>Bigfile stream navigation</legend>
              <button
                className="secondary-action"
                disabled={bigfileStreamIndex === 0}
                onClick={() => onSetBigfileChunkIndex((current) => Math.max(0, current - 1))}
                type="button"
              >
                Previous stream
              </button>
              <div className="chunk-detail">
                <strong>
                  {bigfileStreamIndex === 0
                    ? "Transfer manifest"
                    : (activeBigfileChunk?.fileName ?? "Chunk unavailable")}
                </strong>
                {activeBigfileChunk ? (
                  <span>
                    Stream {bigfileStreamIndex + 1}/{nativeBigfileChunkCount} · chunk{" "}
                    {activeBigfileChunk.index + 1}/{nativeBigfileChunkCount - 1} ·{" "}
                    {formatBytes(activeBigfileChunk.size)} · bytes {activeBigfileChunk.start}-
                    {activeBigfileChunk.end}
                  </span>
                ) : (
                  <span>Stream 1/{nativeBigfileChunkCount} · zero-payload metadata envelope</span>
                )}
              </div>
              <button
                className="secondary-action"
                disabled={bigfileStreamIndex + 1 >= nativeBigfileChunkCount}
                onClick={() =>
                  onSetBigfileChunkIndex((current) =>
                    Math.min(nativeBigfileChunkCount - 1, current + 1),
                  )
                }
                type="button"
              >
                Next stream
              </button>
            </fieldset>
          ) : null}

          <div className="control-row">
            <div className="field-block">
              <ParameterLabel
                active={activeHelp === "encode-mode"}
                help={parameterHelp["encode-mode"]}
                label="Mode"
                onToggle={() => onToggleHelp("encode-mode")}
              />
              <fieldset className="mode-control">
                <legend>Mode</legend>
                {encodeModeOptions.map((option) => (
                  <button
                    aria-pressed={encoderConfig.mode === option.id}
                    data-mode={option.id}
                    disabled={fileIsLarge && option.id !== "b"}
                    key={option.id}
                    onClick={() => onSetEncoderConfig({ ...encoderConfig, mode: option.id })}
                    type="button"
                  >
                    {encoderConfig.mode === option.id ? (
                      <Check className="mode-check" aria-hidden="true" />
                    ) : null}
                    <strong className="mode-label">{option.label}</strong>
                    <span className="mode-detail">{option.detail}</span>
                  </button>
                ))}
              </fieldset>
              <ParameterHelp
                active={activeHelp === "encode-mode"}
                help={parameterHelp["encode-mode"]}
              />
            </div>
            <div className="field-block">
              <ParameterLabel
                active={activeHelp === "encode-fps"}
                help={parameterHelp["encode-fps"]}
                label="FPS"
                onToggle={() => onToggleHelp("encode-fps")}
              />
              <NumberInput
                aria-label="FPS"
                max={scalarBounds.fps.max}
                min={scalarBounds.fps.min}
                onValueChange={(value) =>
                  onSetEncoderConfig(updateEncoderNumber(encoderConfig, "fps", value))
                }
                step={scalarBounds.fps.step}
                value={encoderConfig.fps}
              />
            </div>
          </div>

          <div className="toggle-grid">
            <div className="toggle-field">
              <input
                aria-label="Wake lock"
                checked={encoderConfig.wakeLock}
                onChange={(event) =>
                  onSetEncoderConfig({ ...encoderConfig, wakeLock: event.currentTarget.checked })
                }
                type="checkbox"
              />
              <BatteryCharging aria-hidden="true" />
              <ParameterLabel
                active={activeHelp === "wake-lock"}
                help={parameterHelp["wake-lock"]}
                label="Wake lock"
                onToggle={() => onToggleHelp("wake-lock")}
              />
            </div>
            <div className="toggle-field">
              <input
                aria-label="Color balance"
                checked={encoderConfig.colorBalance}
                onChange={(event) =>
                  onSetEncoderConfig({
                    ...encoderConfig,
                    colorBalance: event.currentTarget.checked,
                  })
                }
                type="checkbox"
              />
              <Palette aria-hidden="true" />
              <ParameterLabel
                active={activeHelp === "color-balance"}
                help={parameterHelp["color-balance"]}
                label="Color balance"
                onToggle={() => onToggleHelp("color-balance")}
              />
            </div>
            <div className="toggle-field">
              <input
                aria-label="Fullscreen target"
                checked={encoderConfig.fullscreen}
                onChange={(event) =>
                  onSetEncoderConfig({
                    ...encoderConfig,
                    fullscreen: event.currentTarget.checked,
                  })
                }
                type="checkbox"
              />
              <Maximize2 aria-hidden="true" />
              <ParameterLabel
                active={activeHelp === "fullscreen-target"}
                help={parameterHelp["fullscreen-target"]}
                label="Fullscreen target"
                onToggle={() => onToggleHelp("fullscreen-target")}
              />
            </div>
            <div className="toggle-field">
              <input
                aria-label="Fullscreen margin"
                checked={encoderConfig.fullscreenMargin}
                onChange={(event) =>
                  onSetEncoderConfig({
                    ...encoderConfig,
                    fullscreenMargin: event.currentTarget.checked,
                  })
                }
                type="checkbox"
              />
              <Maximize2 aria-hidden="true" />
              <ParameterLabel
                active={activeHelp === "fullscreen-margin"}
                help={parameterHelp["fullscreen-margin"]}
                label="Fullscreen margin"
                onToggle={() => onToggleHelp("fullscreen-margin")}
              />
            </div>
          </div>

          <button
            className="disclosure"
            onClick={() => onSetAdvanced({ ...advanced, encoder: !advanced.encoder })}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" />
            Advanced encoder configuration
            <ChevronDown aria-hidden="true" data-open={advanced.encoder} />
          </button>

          {advanced.encoder ? (
            <div className="advanced-grid">
              <div className="field-block">
                <ParameterLabel
                  active={activeHelp === "redundancy"}
                  help={parameterHelp.redundancy}
                  label="Redundancy"
                  onToggle={() => onToggleHelp("redundancy")}
                />
                <NumberInput
                  aria-label="Redundancy"
                  max={scalarBounds.redundancy.max}
                  min={scalarBounds.redundancy.min}
                  onValueChange={(value) =>
                    onSetEncoderConfig(updateEncoderNumber(encoderConfig, "redundancy", value))
                  }
                  step={scalarBounds.redundancy.step}
                  value={encoderConfig.redundancy}
                />
              </div>
              <div className="field-block">
                <ParameterLabel
                  active={activeHelp === "chunk-size"}
                  help={parameterHelp["chunk-size"]}
                  label="Chunk size MiB"
                  onToggle={() => onToggleHelp("chunk-size")}
                />
                <NumberInput
                  aria-label="Chunk size MiB"
                  disabled={fileIsLarge}
                  formatValue={(value) => String(Number(value.toFixed(2)))}
                  max={scalarBounds.chunkSizeMiB.max}
                  min={scalarBounds.chunkSizeMiB.min}
                  onValueChange={(value) =>
                    onSetEncoderConfig(
                      updateEncoderNumber(
                        encoderConfig,
                        "chunkSize",
                        Math.round(value * 1024 * 1024),
                      ),
                    )
                  }
                  step={scalarBounds.chunkSizeMiB.step}
                  value={Number((encoderConfig.chunkSize / (1024 * 1024)).toFixed(2))}
                />
              </div>
              <div className="field-block">
                <ParameterLabel
                  active={activeHelp === "encode-id-strategy"}
                  help={parameterHelp["encode-id-strategy"]}
                  label="Encode id strategy"
                  onToggle={() => onToggleHelp("encode-id-strategy")}
                />
                <select
                  aria-label="Encode id strategy"
                  disabled={fileIsLarge}
                  value={encoderConfig.encodeIdStrategy}
                  onChange={(event) =>
                    onSetEncoderConfig({
                      ...encoderConfig,
                      encodeIdStrategy: event.currentTarget
                        .value as EncoderConfig["encodeIdStrategy"],
                    })
                  }
                >
                  <option value="auto">Auto timestamp low 16-bit</option>
                  <option value="manual">Manual session id</option>
                </select>
              </div>
              <div className="field-block">
                <ParameterLabel
                  active={activeHelp === "encode-id-base"}
                  help={parameterHelp["encode-id-base"]}
                  label="Encode id base"
                  onToggle={() => onToggleHelp("encode-id-base")}
                />
                <NumberInput
                  aria-label="Encode id base"
                  disabled={encoderConfig.encodeIdStrategy === "auto" || fileIsLarge}
                  max={scalarBounds.encodeId.max}
                  min={scalarBounds.encodeId.min}
                  onValueChange={(value) =>
                    onSetEncoderConfig(updateEncoderNumber(encoderConfig, "encodeIdBase", value))
                  }
                  step={scalarBounds.encodeId.step}
                  value={encoderConfig.encodeIdBase}
                />
              </div>
            </div>
          ) : null}

          {encoderIssues.length > 0 ? <IssueList issues={encoderIssues} /> : null}

          <div className="action-row">
            {!canPauseEncoder ? (
              <button
                className="primary-action"
                disabled={!canRunEncoder}
                onClick={onRunEncode}
                title={startDisabledReason ?? undefined}
                type="button"
              >
                <Play aria-hidden="true" />
                {encoderState.kind === "loadingWasm" ? "Loading WASM" : encoderActionLabel}
              </button>
            ) : null}
            {canPauseEncoder ? (
              <button className="secondary-action" onClick={onPauseEncode} type="button">
                <Pause aria-hidden="true" />
                Pause
              </button>
            ) : null}
            {showStartReason && !canPauseEncoder ? (
              <span className="action-reason">{startDisabledReason}</span>
            ) : null}
          </div>
        </section>

        <SenderPreview
          bigfilePlan={bigfilePlan}
          chunks={chunks}
          encoderConfig={encoderConfig}
          encoderState={encoderState}
          estimate={estimate}
          runtimeCanvasRef={runtimeCanvasRef}
          selectedFile={selectedFile}
          senderFullscreenRef={senderFullscreenRef}
          onRequestFullscreen={onRequestFullscreen}
        />
      </section>
    </section>
  );
}
