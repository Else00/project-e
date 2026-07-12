import { Cpu, Gauge, Maximize2, RadioTower, ShieldCheck, Zap } from "lucide-react";
import type { RefObject } from "react";
import type { EncoderConfig } from "../../domain/cimbar";
import { wasmModeValues } from "../../domain/cimbar";
import type { EncoderState } from "../../domain/state";
import type { BigfilePlan } from "../../features/bigfile/bigfilePlan";
import { cimbarVendorManifest } from "../../vendor/cimbarVendorManifest";
import { i18n } from "../i18n";
import { TechnicalReadout } from "../uiPrimitives";

type SenderPreviewProps = Readonly<{
  bigfilePlan: BigfilePlan;
  chunks: number;
  encoderConfig: EncoderConfig;
  encoderState: EncoderState;
  estimate: string;
  runtimeCanvasRef: RefObject<HTMLCanvasElement | null>;
  selectedFile: File | null;
  senderFullscreenRef: RefObject<HTMLDivElement | null>;
  onRequestFullscreen: () => void;
}>;

export function SenderPreview({
  bigfilePlan,
  chunks,
  encoderConfig,
  encoderState,
  estimate,
  runtimeCanvasRef,
  selectedFile,
  senderFullscreenRef,
  onRequestFullscreen,
}: SenderPreviewProps) {
  const showTechnicalReadouts = Boolean(selectedFile) || encoderState.kind !== "idle";
  const showFrameSurface = Boolean(selectedFile) || encoderState.kind !== "idle";
  const showFrameStatus = encoderState.kind !== "idle";
  const fullscreenDisabled = !showFrameSurface;
  const showBigfileReadouts = bigfilePlan.kind === "planned";
  const streamStatus =
    encoderState.kind === "rendering" || encoderState.kind === "paused"
      ? `Symbol ${encoderState.frame} · ${encoderState.kind} · no fixed total`
      : null;

  return (
    <section className="panel preview-panel" aria-labelledby="preview-title">
      <div className="panel-heading">
        <div>
          <h2 id="preview-title">{i18n.encode.frameOutput}</h2>
          <p>{i18n.encode.frameOutputDetail}</p>
        </div>
        <button
          aria-label="Show code fullscreen"
          className="icon-action"
          disabled={fullscreenDisabled}
          onClick={onRequestFullscreen}
          title={fullscreenDisabled ? i18n.encode.chooseFileFirst : "Show code fullscreen"}
          type="button"
        >
          <Maximize2 aria-hidden="true" />
        </button>
      </div>
      {showFrameSurface ? (
        <section
          className="cimbar-preview"
          data-state={encoderState.kind}
          aria-label="Runtime preview"
        >
          <div
            className="sender-frame-target"
            data-fullscreen-margin={encoderConfig.fullscreenMargin}
            ref={senderFullscreenRef}
          >
            <canvas
              aria-label="Rendered Cimbar frame"
              className="cimbar-canvas"
              id="canvas"
              ref={runtimeCanvasRef}
            />
          </div>
          {showFrameStatus ? (
            <div>
              <strong>
                {encoderState.kind === "rendering" || encoderState.kind === "paused"
                  ? `${encoderState.fileName}`
                  : i18n.encode.encodeStatus}
              </strong>
              <span>
                {encoderState.kind === "failed"
                  ? encoderState.message
                  : encoderState.kind === "rendering" || encoderState.kind === "paused"
                    ? streamStatus
                    : i18n.encode.loadingWasm}
              </span>
            </div>
          ) : null}
        </section>
      ) : (
        <div
          className="sender-frame-target sr-only"
          data-fullscreen-margin={encoderConfig.fullscreenMargin}
          ref={senderFullscreenRef}
        >
          <canvas
            aria-label="Rendered Cimbar frame"
            className="cimbar-canvas"
            id="canvas"
            ref={runtimeCanvasRef}
          />
        </div>
      )}
      <div className="cimbar-runtime-bridge" aria-hidden="true">
        <div id="dragdrop" />
        <div id="invisible_click" />
        <div id="current-file" />
        <div id="status" />
        <div id="nav-button" />
        <div id="nav-container" />
        <div id="nav-content">
          <a href="#runtime-file-input" id="nav-find-file-link">
            Runtime file input
          </a>
        </div>
        <input id="file_input" tabIndex={-1} type="file" />
      </div>

      {showTechnicalReadouts ? (
        <>
          <div className="readout-grid">
            <TechnicalReadout
              icon={<Cpu aria-hidden="true" />}
              label="Vendor"
              value={cimbarVendorManifest.version}
            />
            <TechnicalReadout
              icon={<Gauge aria-hidden="true" />}
              label="Mode"
              value={`${encoderConfig.mode.toUpperCase()} · ${wasmModeValues[encoderConfig.mode]}`}
            />
            <TechnicalReadout
              icon={<RadioTower aria-hidden="true" />}
              label="Chunks"
              value={String(chunks)}
            />
            <TechnicalReadout icon={<Zap aria-hidden="true" />} label="Estimate" value={estimate} />
          </div>

          <div className="readout-grid compact-plan-grid" data-bigfile={showBigfileReadouts}>
            <TechnicalReadout
              icon={<Gauge aria-hidden="true" />}
              label="Plan"
              value={
                bigfilePlan.kind === "direct-preferred"
                  ? i18n.encode.directPlanLabel
                  : bigfilePlan.kind
              }
            />
            {showBigfileReadouts ? (
              <>
                <TechnicalReadout
                  icon={<RadioTower aria-hidden="true" />}
                  label="Bigfile chunks"
                  value={String(bigfilePlan.chunkCount)}
                />
                <TechnicalReadout
                  icon={<Cpu aria-hidden="true" />}
                  label="Streams"
                  value={String(bigfilePlan.encodeStreams)}
                />
              </>
            ) : null}
            <TechnicalReadout
              icon={<ShieldCheck aria-hidden="true" />}
              label="Integrity"
              value={bigfilePlan.kind === "planned" ? "chunk + file BLAKE3" : "direct envelope"}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
