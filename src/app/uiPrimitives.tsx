import { AlertTriangle, CheckCircle2, Info, Monitor, Moon, Sun } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ConfigIssue } from "../domain/cimbar";
import { assertNever } from "../domain/assertNever";
import type { CapabilityCheck } from "../domain/state";
import type { ThemePreference } from "../features/theme/theme";
import { clampProgress, percentLabel } from "./appLogic";

const allowedTermClasses = new Set(["term-auto", "term-b", "term-bm", "term-bu", "term-4c"]);
const inlineTokenPattern =
  /(\[([^\]]+)\]\{\.([a-z0-9-]+)\})|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(_([^_]+)_)/gi;

export function stripHelpMarkup(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\{\.[a-z0-9-]+\}/gi, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\n{2,}/g, " ")
    .trim();
}

function renderInlineHelp(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(inlineTokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(value.slice(cursor, index));
    }
    if (match[2] && match[3] && allowedTermClasses.has(match[3])) {
      nodes.push(
        <span className={`tooltip-term ${match[3]}`} key={`${index}-term`}>
          {match[2]}
        </span>,
      );
    } else if (match[5]) {
      nodes.push(<code key={`${index}-code`}>{match[5]}</code>);
    } else if (match[7]) {
      nodes.push(<strong key={`${index}-strong`}>{match[7]}</strong>);
    } else if (match[9]) {
      nodes.push(<em key={`${index}-em`}>{match[9]}</em>);
    } else {
      nodes.push(match[0]);
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }
  return nodes;
}

export function RichHelpText({ value }: { readonly value: string }) {
  const paragraphs = value.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{renderInlineHelp(paragraph)}</p>
      ))}
    </>
  );
}

export const issueIcon = (severity: ConfigIssue["severity"]) => {
  switch (severity) {
    case "error":
      return <AlertTriangle aria-hidden="true" />;
    case "warning":
      return <AlertTriangle aria-hidden="true" />;
    case "info":
      return <Info aria-hidden="true" />;
    default:
      return assertNever(severity);
  }
};

export const themeIcon = (theme: ThemePreference) => {
  switch (theme) {
    case "system":
      return <Monitor aria-hidden="true" />;
    case "light":
      return <Sun aria-hidden="true" />;
    case "dark":
      return <Moon aria-hidden="true" />;
    default:
      return assertNever(theme);
  }
};

export function CapabilityRow({ check }: { readonly check: CapabilityCheck }) {
  return (
    <div className="capability-row" data-ok={check.ok}>
      {check.ok ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div>
        <strong>{check.label}</strong>
        <span>{check.detail}</span>
      </div>
      <code>{check.requiredFor}</code>
    </div>
  );
}

export function IssueList({ issues }: { readonly issues: readonly ConfigIssue[] }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <ul className="issue-list">
      {issues.map((issue) => (
        <li className="issue" data-severity={issue.severity} key={issue.id}>
          {issueIcon(issue.severity)}
          <div>
            <strong>{issue.message}</strong>
            <span>{issue.recovery}</span>
          </div>
          <code>{issue.field}</code>
        </li>
      ))}
    </ul>
  );
}

export function ParameterLabel({
  active,
  help,
  label,
  onToggle,
}: {
  readonly active: boolean;
  readonly help: string;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  const infoRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const plainHelp = stripHelpMarkup(help);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const updatePosition = () => {
      const anchor = infoRef.current;
      const popover = popoverRef.current;
      const rect = anchor?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const gap = 12;
      const width = Math.min(340, Math.max(220, viewportWidth - margin * 2));
      const popoverHeight = popover?.offsetHeight || 180;
      const center = rect.left + rect.width / 2;
      const left = Math.min(Math.max(margin, center - width / 2), viewportWidth - width - margin);
      const spaceBelow = viewportHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const nextPlacement =
        spaceBelow >= popoverHeight || spaceBelow >= spaceAbove ? "bottom" : "top";
      const rawTop =
        nextPlacement === "bottom" ? rect.bottom + gap : rect.top - gap - popoverHeight;
      const maxTop = Math.max(margin, viewportHeight - popoverHeight - margin);
      const top = Math.min(Math.max(margin, rawTop), maxTop);
      const arrowLeft = Math.min(Math.max(10, center - left - 7), width - 24);
      setPlacement(nextPlacement);
      setPopoverStyle({
        "--tooltip-arrow-left": `${arrowLeft}px`,
        "--tooltip-left": `${left}px`,
        "--tooltip-top": `${top}px`,
        "--tooltip-width": `${width}px`,
      } as CSSProperties);
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active]);

  return (
    <span className="parameter-label">
      <span>{label}</span>
      {active ? (
        <button
          aria-label="Close parameter detail"
          className="tooltip-scrim"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle();
          }}
          type="button"
        />
      ) : null}
      <button
        aria-label={`Parameter detail: ${plainHelp}`}
        aria-pressed={active}
        className="parameter-info"
        ref={infoRef}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
        title={plainHelp}
        type="button"
      >
        <Info aria-hidden="true" />
      </button>
      {active ? (
        <span
          className="parameter-popover"
          data-placement={placement}
          ref={popoverRef}
          role="tooltip"
          style={popoverStyle}
        >
          <RichHelpText value={help} />
        </span>
      ) : null}
    </span>
  );
}

export function ParameterHelp({
  active,
  help,
}: {
  readonly active: boolean;
  readonly help: string;
}) {
  return active ? <span className="sr-only">{help}</span> : null;
}

export function TechnicalReadout({
  label,
  value,
  icon,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: ReactNode;
}) {
  return (
    <div className="readout">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProgressMeter({
  label,
  value,
  detail,
  tone = "info",
}: {
  readonly label: string;
  readonly value: number;
  readonly detail: string;
  readonly tone?: "info" | "success" | "warning" | "danger";
}) {
  const bounded = clampProgress(value);
  return (
    <div className="progress-meter" data-tone={tone}>
      <div className="progress-meter-header">
        <span>{label}</span>
        <strong>{percentLabel(bounded)}</strong>
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(bounded * 100)}
        className="progress-track"
        role="progressbar"
      >
        <span style={{ inlineSize: `${bounded * 100}%` }} />
      </div>
      <p>{detail}</p>
    </div>
  );
}
