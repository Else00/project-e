import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Download,
  Gauge,
  Info,
  RadioTower,
  Settings2,
  ShieldCheck,
  Square,
} from "lucide-react";
import type { RefObject } from "react";
import type { ConfigIssue, DecoderConfig } from "../../domain/cimbar";
import { scalarBounds } from "../../domain/scalars";
import type { DecoderState, DownloadState } from "../../domain/state";
import { formatBytes } from "../../domain/validators";
import type { BigfileReassemblyState } from "../../features/bigfile/bigfileReassembly";
import { decodeModeOptions, parameterHelp } from "../appOptions";
import {
  reassemblyMissingLabel,
  reassemblyProgressLabel,
  reassemblyStatusMessage,
  updateDecoderNumber,
} from "../appLogic";
import type {
  AdvancedState,
  DirectIntegrityState,
  ParameterHelpId,
  ReassemblyIntegrityState,
} from "../appTypes";
import {
  IssueList,
  ParameterHelp,
  ParameterLabel,
  ProgressMeter,
  TechnicalReadout,
} from "../uiPrimitives";
import { NumberInput } from "./NumberInput";

type DecodeWorkspaceProps = Readonly<{
  activeHelp: ParameterHelpId | null;
  advanced: AdvancedState;
  bigfileIntegrity: ReassemblyIntegrityState;
  bigfileReassemblyDownload: DownloadState;
  bigfileReassemblyError: string | null;
  bigfileReassemblyState: BigfileReassemblyState;
  canDownloadReassembled: boolean;
  canRunDecoder: boolean;
  canStopDecode: boolean;
  cameraVideoRef: RefObject<HTMLVideoElement | null>;
  decoderConfig: DecoderConfig;
  decoderIssues: readonly ConfigIssue[];
  decoderProgress: Readonly<{ value: number; label: string; detail: string }>;
  decoderStartReason: string | null;
  decoderState: DecoderState;
  decoderStream: MediaStream | null;
  directIntegrity: DirectIntegrityState;
  downloadState: DownloadState;
  reassemblyProgress: number;
  onSetAdvanced: (advanced: AdvancedState) => void;
  onSetDecoderConfig: (config: DecoderConfig) => void;
  onStartDecode: () => void;
  onStopDecode: () => void;
  onToggleHelp: (id: ParameterHelpId) => void;
}>;

export function DecodeWorkspace({
  activeHelp,
  advanced,
  bigfileIntegrity,
  bigfileReassemblyDownload,
  bigfileReassemblyError,
  bigfileReassemblyState,
  canDownloadReassembled,
  canRunDecoder,
  canStopDecode,
  cameraVideoRef,
  decoderConfig,
  decoderIssues,
  decoderProgress,
  decoderStartReason,
  decoderState,
  decoderStream,
  directIntegrity,
  downloadState,
  reassemblyProgress,
  onSetAdvanced,
  onSetDecoderConfig,
  onStartDecode,
  onStopDecode,
  onToggleHelp,
}: DecodeWorkspaceProps) {
  const showDecoderProgress = decoderState.kind !== "idle" && decoderState.kind !== "stopped";
  const showReassemblyDetails = bigfileReassemblyState.kind !== "empty";
  const diagnostics =
    decoderState.kind === "scanning" || decoderState.kind === "decoding"
      ? decoderState.diagnostics
      : undefined;
  const cameraResolution =
    diagnostics?.camera?.width && diagnostics.camera.height
      ? diagnostics.camera.width >= 3840 && diagnostics.camera.height >= 2160
        ? "4K"
        : diagnostics.camera.width >= 1920 && diagnostics.camera.height >= 1080
          ? "1080p"
          : diagnostics.camera.width >= 1280 && diagnostics.camera.height >= 720
            ? "720p"
            : `${diagnostics.camera.width}x${diagnostics.camera.height}`
      : null;
  const cameraLabel = diagnostics?.camera
    ? cameraResolution
      ? `${cameraResolution}${
          diagnostics.camera.frameRate ? `/${Math.round(diagnostics.camera.frameRate)}fps` : ""
        }`
      : "camera settings unavailable"
    : "waiting";
  const frameLabel = diagnostics?.lastFrame
    ? `${diagnostics.lastFrame.format} ${diagnostics.lastFrame.width}x${diagnostics.lastFrame.height}`
    : "none";

  return (
    <section className="workspace-view" aria-label="Decode workspace">
      <section className="workspace-grid decode-workspace">
        <section className="panel decoder-panel" aria-labelledby="decoder-title">
          <div className="panel-heading">
            <div>
              <h2 id="decoder-title">Decode settings</h2>
              <p>Scanner controls stay separate from sender controls.</p>
            </div>
            <Settings2 aria-hidden="true" />
          </div>

          <div className="control-row">
            <div className="field-block">
              <ParameterLabel
                active={activeHelp === "decode-mode"}
                help={parameterHelp["decode-mode"]}
                label="Decode mode"
                onToggle={() => onToggleHelp("decode-mode")}
              />
              <fieldset className="mode-control decoder-mode-control">
                <legend>Decode mode</legend>
                {decodeModeOptions.map((option) => (
                  <button
                    aria-pressed={decoderConfig.mode === option.id}
                    data-mode={option.id}
                    key={option.id}
                    onClick={() => onSetDecoderConfig({ ...decoderConfig, mode: option.id })}
                    type="button"
                  >
                    <strong className="mode-label">{option.label}</strong>
                    <span className="mode-detail">{option.detail}</span>
                  </button>
                ))}
              </fieldset>
              <ParameterHelp
                active={activeHelp === "decode-mode"}
                help={parameterHelp["decode-mode"]}
              />
            </div>
            <div className="field-block">
              <ParameterLabel
                active={activeHelp === "frame-limit"}
                help={parameterHelp["frame-limit"]}
                label="Frame limit"
                onToggle={() => onToggleHelp("frame-limit")}
              />
              <NumberInput
                aria-label="Frame limit"
                max={scalarBounds.fps.max}
                min={scalarBounds.fps.min}
                onValueChange={(value) =>
                  onSetDecoderConfig(updateDecoderNumber(decoderConfig, "frameRateLimit", value))
                }
                step={scalarBounds.fps.step}
                value={decoderConfig.frameRateLimit}
              />
            </div>
          </div>

          <button
            className="disclosure"
            onClick={() => onSetAdvanced({ ...advanced, decoder: !advanced.decoder })}
            type="button"
          >
            <Settings2 aria-hidden="true" />
            Advanced decoder configuration
            <ChevronDown aria-hidden="true" data-open={advanced.decoder} />
          </button>

          {advanced.decoder ? (
            <div className="advanced-grid">
              <div className="field-block">
                <ParameterLabel
                  active={activeHelp === "workers"}
                  help={parameterHelp.workers}
                  label="Workers"
                  onToggle={() => onToggleHelp("workers")}
                />
                <NumberInput
                  aria-label="Workers"
                  max={scalarBounds.workerCount.max}
                  min={scalarBounds.workerCount.min}
                  onValueChange={(value) =>
                    onSetDecoderConfig(updateDecoderNumber(decoderConfig, "workers", value))
                  }
                  step={scalarBounds.workerCount.step}
                  value={decoderConfig.workers}
                />
              </div>
              <div className="toggle-field">
                <input
                  aria-label="Auto-detect mode"
                  checked={decoderConfig.autoDetect}
                  onChange={(event) =>
                    onSetDecoderConfig({
                      ...decoderConfig,
                      autoDetect: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
                <ParameterLabel
                  active={activeHelp === "auto-detect"}
                  help={parameterHelp["auto-detect"]}
                  label="Auto-detect mode"
                  onToggle={() => onToggleHelp("auto-detect")}
                />
              </div>
              <div className="toggle-field">
                <input
                  aria-label="Prefer NV12/I420"
                  checked={decoderConfig.preferNativeFormats}
                  onChange={(event) =>
                    onSetDecoderConfig({
                      ...decoderConfig,
                      preferNativeFormats: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
                <ParameterLabel
                  active={activeHelp === "native-formats"}
                  help={parameterHelp["native-formats"]}
                  label="Prefer NV12/I420"
                  onToggle={() => onToggleHelp("native-formats")}
                />
              </div>
            </div>
          ) : null}

          <IssueList issues={decoderIssues} />
        </section>

        <section className="panel scanner-panel" aria-labelledby="scanner-title">
          <div className="panel-heading">
            <div>
              <h2 id="scanner-title">Camera scanner</h2>
              <p>Camera starts only when browser capabilities and config are valid.</p>
            </div>
            <Camera aria-hidden="true" />
          </div>
          <div className="camera-surface" data-state={decoderState.kind}>
            <video
              aria-label="Camera preview"
              autoPlay
              className="camera-preview"
              hidden={!decoderStream}
              muted
              playsInline
              ref={cameraVideoRef}
            />
            {!decoderStream ? <Camera aria-hidden="true" /> : null}
            <strong>{decoderState.kind}</strong>
            <span>
              {decoderState.kind === "failed"
                ? `${decoderState.message} ${decoderState.recovery}`
                : decoderState.kind === "complete"
                  ? `${decoderState.fileName} · ${formatBytes(decoderState.size)}`
                  : decoderState.kind === "requestingCamera"
                    ? "Requesting camera permission."
                    : decoderState.kind === "scanning" || decoderState.kind === "decoding"
                      ? diagnostics?.lastWorkerMessage ||
                        "Camera stream is active; waiting for worker responses."
                      : decoderState.kind === "stopped"
                        ? "Camera stopped and media tracks released."
                        : "No camera active."}
            </span>
          </div>

          {showDecoderProgress ? (
            <>
              <ProgressMeter
                detail={decoderProgress.detail}
                label="Decode progress"
                tone={decoderState.kind === "complete" ? "success" : "info"}
                value={decoderProgress.value}
              />

              {diagnostics ? (
                <div className="readout-grid compact-plan-grid" data-bigfile="true">
                  <div className="readout">
                    <Camera aria-hidden="true" />
                    <span>Camera</span>
                    <strong>{cameraLabel}</strong>
                  </div>
                  <div className="readout">
                    <Square aria-hidden="true" />
                    <span>Frame</span>
                    <strong>{frameLabel}</strong>
                  </div>
                  <div className="readout">
                    <RadioTower aria-hidden="true" />
                    <span>Worker</span>
                    <strong>
                      {diagnostics.noDataFrames}/{diagnostics.failedExtractFrames}/
                      {diagnostics.decodedFrames}
                    </strong>
                  </div>
                  <div className="readout">
                    <Gauge aria-hidden="true" />
                    <span>In flight</span>
                    <strong>{diagnostics.inFlightFrames}</strong>
                  </div>
                </div>
              ) : null}

              <div className="decode-output" data-state={decoderState.kind}>
                <Download aria-hidden="true" />
                <div>
                  <strong>
                    {decoderState.kind === "complete" ? decoderState.fileName : "No decoded file"}
                  </strong>
                  <span>
                    {decoderState.kind === "complete"
                      ? `${formatBytes(decoderState.size)} ready for local download.`
                      : "A download is shown only after the receiver completes a real decode."}
                  </span>
                </div>
              </div>

              <div
                className="bigfile-note"
                data-kind={
                  directIntegrity.kind === "failed"
                    ? "blocked"
                    : directIntegrity.kind === "verified"
                      ? "complete"
                      : "collecting"
                }
              >
                {directIntegrity.kind === "failed" ? (
                  <AlertTriangle aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                <div>
                  <strong>{directIntegrity.label}</strong>
                  <span>{directIntegrity.message}</span>
                </div>
              </div>
            </>
          ) : null}

          <div className="action-row">
            {downloadState.kind === "ready" ? (
              <a
                className="secondary-link"
                download={downloadState.fileName}
                href={downloadState.url}
              >
                <Download aria-hidden="true" />
                Download decoded file
              </a>
            ) : null}
            {!canStopDecode ? (
              <button
                className="primary-action"
                disabled={!canRunDecoder}
                onClick={onStartDecode}
                title={decoderStartReason ?? undefined}
                type="button"
              >
                <Camera aria-hidden="true" />
                Start camera
              </button>
            ) : null}
            {canStopDecode ? (
              <button className="secondary-action" onClick={onStopDecode} type="button">
                <Square aria-hidden="true" />
                Stop
              </button>
            ) : null}
            {decoderStartReason && !canStopDecode ? (
              <span className="action-reason">{decoderStartReason}</span>
            ) : null}
          </div>
        </section>

        <section className="panel reassembly-panel" aria-labelledby="reassembly-title">
          <div className="panel-heading">
            <div>
              <h2 id="reassembly-title">Bigfile reassembly</h2>
              <p>Verified manifest and chunk streams are collected by transfer ID.</p>
            </div>
            <RadioTower aria-hidden="true" />
          </div>

          {showReassemblyDetails ? (
            <>
              <div className="reassembly-grid">
                <TechnicalReadout
                  icon={<ShieldCheck aria-hidden="true" />}
                  label="State"
                  value={bigfileReassemblyState.kind}
                />
                <TechnicalReadout
                  icon={<Gauge aria-hidden="true" />}
                  label="Progress"
                  value={reassemblyProgressLabel(bigfileReassemblyState)}
                />
                <TechnicalReadout
                  icon={<RadioTower aria-hidden="true" />}
                  label="Missing chunks"
                  value={reassemblyMissingLabel(bigfileReassemblyState)}
                />
                <TechnicalReadout
                  icon={<Download aria-hidden="true" />}
                  label="Output"
                  value={`${bigfileReassemblyState.fileName} · ${formatBytes(
                    bigfileReassemblyState.size,
                  )}`}
                />
                <TechnicalReadout
                  icon={<ShieldCheck aria-hidden="true" />}
                  label="Integrity"
                  value={bigfileIntegrity.label}
                />
              </div>

              <ProgressMeter
                detail={
                  bigfileReassemblyState.kind === "complete"
                    ? `All ${bigfileReassemblyState.chunkCount} chunks received.`
                    : `${bigfileReassemblyState.received.length} of ${bigfileReassemblyState.chunkCount} chunks received.`
                }
                label="Bigfile progress"
                tone={bigfileReassemblyState.kind === "complete" ? "success" : "info"}
                value={reassemblyProgress}
              />

              <div
                className="bigfile-note"
                data-kind={
                  bigfileIntegrity.kind === "failed" ? "blocked" : bigfileReassemblyState.kind
                }
              >
                {bigfileReassemblyError || bigfileIntegrity.kind === "failed" ? (
                  <AlertTriangle aria-hidden="true" />
                ) : (
                  <Info aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {reassemblyStatusMessage(
                      bigfileReassemblyState,
                      bigfileIntegrity,
                      bigfileReassemblyError,
                    )}
                  </strong>
                  <span>
                    Verified manifest and chunk envelopes are collected automatically by transfer
                    ID. Filenames are presentation hints and never control ordering.
                  </span>
                </div>
              </div>
            </>
          ) : null}

          {canDownloadReassembled ? (
            <div className="action-row">
              <a
                className="secondary-link"
                download={
                  bigfileReassemblyDownload.kind === "ready"
                    ? bigfileReassemblyDownload.fileName
                    : undefined
                }
                href={
                  bigfileReassemblyDownload.kind === "ready"
                    ? bigfileReassemblyDownload.url
                    : undefined
                }
              >
                <Download aria-hidden="true" />
                Download reassembled file
              </a>
            </div>
          ) : null}
        </section>
      </section>
    </section>
  );
}
