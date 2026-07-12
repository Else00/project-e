import { ShieldCheck } from "lucide-react";
import type { CapabilityState } from "../../domain/state";
import type { WorkspaceTab } from "../appTypes";
import { workspaceTabs } from "../appOptions";

type AppHeaderProps = Readonly<{
  activeWorkspaceTab: WorkspaceTab;
  capabilityState: CapabilityState;
  onSelectWorkspace: (tab: WorkspaceTab) => void;
}>;

export function AppHeader({
  activeWorkspaceTab,
  capabilityState,
  onSelectWorkspace,
}: AppHeaderProps) {
  const status = capabilityState.kind === "ready" ? capabilityState.status : "checking";
  return (
    <header className="app-shell">
      <div className="brand-lockup">
        <h1 className="brand-word" data-text="project-e">
          project-e
        </h1>
        <span className="brand-signal" aria-hidden="true">
          optical transfer console
        </span>
      </div>

      <nav className="workspace-tabs" aria-label="Workspace mode">
        {workspaceTabs.map((tab) => (
          <button
            aria-current={activeWorkspaceTab === tab.id ? "page" : undefined}
            key={tab.id}
            onClick={() => onSelectWorkspace(tab.id)}
            type="button"
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="shell-actions">
        <div className="topbar-status" data-status={status}>
          <ShieldCheck aria-hidden="true" />
          <span>{status}</span>
        </div>
      </div>
    </header>
  );
}
