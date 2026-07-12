import { ChevronDown, Cpu, Lock, Monitor, ShieldCheck } from "lucide-react";
import { programVersion, protocolVersions } from "../../domain/protocolVersions";
import type { CapabilityCheck } from "../../domain/state";
import { cimbarVendorManifest } from "../../vendor/cimbarVendorManifest";
import type { AdvancedState, DisplayMetrics } from "../appTypes";
import { formatAspectRatio, formatDecimalRatio } from "../displayFormat";
import { i18n } from "../i18n";
import { CapabilityRow } from "../uiPrimitives";

type InfoWorkspaceProps = Readonly<{
  advanced: AdvancedState;
  capabilityChecks: readonly CapabilityCheck[];
  displayMetrics: DisplayMetrics;
  onSetAdvanced: (advanced: AdvancedState) => void;
}>;

function formatResolution(width: number, height: number): string {
  return `${Math.round(width)} x ${Math.round(height)}`;
}

function formatRefreshRate(value: number | null): string {
  return value ? `${value} Hz` : "measuring Hz";
}

export function InfoWorkspace({
  advanced,
  capabilityChecks,
  displayMetrics,
  onSetAdvanced,
}: InfoWorkspaceProps) {
  const cssScreenResolution = formatResolution(
    displayMetrics.screenWidth,
    displayMetrics.screenHeight,
  );
  const estimatedPhysicalResolution = formatResolution(
    displayMetrics.physicalScreenWidth,
    displayMetrics.physicalScreenHeight,
  );
  const viewportResolution = formatResolution(
    displayMetrics.visualViewportWidth,
    displayMetrics.visualViewportHeight,
  );
  const screenRatio = formatAspectRatio(displayMetrics.screenWidth, displayMetrics.screenHeight);
  const viewportRatio = formatAspectRatio(
    displayMetrics.visualViewportWidth,
    displayMetrics.visualViewportHeight,
  );
  const orientation =
    displayMetrics.screenHeight > displayMetrics.screenWidth ? "portrait" : "landscape";
  return (
    <section className="workspace-view" aria-label="Settings and info workspace">
      <section
        className="panel diagnostics-panel settings-panel"
        aria-labelledby="diagnostics-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="diagnostics-title">{i18n.info.title}</h2>
            <p>{i18n.info.intro}</p>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <section className="display-diagnostics" aria-labelledby="display-diagnostics-title">
          <div className="panel-heading compact-heading">
            <div>
              <h2 id="display-diagnostics-title">{i18n.info.displayTarget}</h2>
              <p>{i18n.info.displayTargetDetail}</p>
            </div>
            <Monitor aria-hidden="true" />
          </div>
          <div className="display-metrics-layout">
            <div className="monitor-preview-shell" data-orientation={orientation}>
              <div
                className="monitor-preview"
                data-orientation={orientation}
                style={
                  orientation === "landscape"
                    ? {
                        aspectRatio: `${displayMetrics.screenWidth} / ${displayMetrics.screenHeight}`,
                      }
                    : undefined
                }
              >
                <span className="monitor-resolution">{estimatedPhysicalResolution}</span>
                <span className="monitor-subline">
                  {screenRatio} · {formatRefreshRate(displayMetrics.refreshRateHz)}
                </span>
                <span className="monitor-dpr">
                  CSS {cssScreenResolution} ·{" "}
                  {`${formatDecimalRatio(displayMetrics.devicePixelRatio)}x DPR`}
                </span>
                <span className="monitor-viewport">
                  Viewport {viewportResolution} · {viewportRatio}
                </span>
              </div>
            </div>
          </div>
        </section>
        <section className="protocol-diagnostics" aria-labelledby="protocol-diagnostics-title">
          <div className="panel-heading compact-heading">
            <div>
              <h2 id="protocol-diagnostics-title">Transfer protocol</h2>
              <p>Active application and wire contract for every encoded payload.</p>
            </div>
            <Cpu aria-hidden="true" />
          </div>
          <dl className="tech-list protocol-list">
            <div>
              <dt>Web app</dt>
              <dd>{programVersion}</dd>
            </div>
            <div>
              <dt>Protocol package</dt>
              <dd>{protocolVersions.package}</dd>
            </div>
            <div>
              <dt>Wire</dt>
              <dd>{protocolVersions.wire} · major 1 only</dd>
            </div>
            <div>
              <dt>Payload bodies</dt>
              <dd>direct · bigfile manifest · bigfile chunk</dd>
            </div>
            <div>
              <dt>Integrity</dt>
              <dd>{protocolVersions.integrity} · required</dd>
            </div>
            <div>
              <dt>Optical runtime</dt>
              <dd>{protocolVersions.cimbarRuntime}</dd>
            </div>
          </dl>
        </section>
        <div className="capability-list">
          {capabilityChecks.map((check) => (
            <CapabilityRow check={check} key={check.id} />
          ))}
        </div>
        <div className="privacy-note">
          <Lock aria-hidden="true" />
          <div>
            <strong>{i18n.info.localOnly}</strong>
            <span>{i18n.info.localOnlyDetail}</span>
          </div>
        </div>
        <button
          className="disclosure"
          onClick={() => onSetAdvanced({ ...advanced, technical: !advanced.technical })}
          type="button"
        >
          <Cpu aria-hidden="true" />
          {i18n.info.runtimeDetails}
          <ChevronDown aria-hidden="true" data-open={advanced.technical} />
        </button>
        {advanced.technical ? (
          <dl className="tech-list">
            <div>
              <dt>WASM</dt>
              <dd>{cimbarVendorManifest.files.wasm}</dd>
            </div>
            <div>
              <dt>Encoder glue</dt>
              <dd>{cimbarVendorManifest.files.encoderApp}</dd>
            </div>
            <div>
              <dt>Decoder worker</dt>
              <dd>{cimbarVendorManifest.files.decoderWorker}</dd>
            </div>
            <div>
              <dt>Compression</dt>
              <dd>zstd via libcimbar</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </section>
  );
}
