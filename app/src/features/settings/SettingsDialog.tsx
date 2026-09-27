import {
  DatabaseBackup,
  Download,
  ExternalLink,
  FileDown,
  FileJson,
  FileText,
  FolderInput,
  FolderOpen,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { handleModalKeyDown, useModalFocus } from "../../components/Dialog";
import { themeFamilies, themeModes, type ThemeFamily, type ThemeMode } from "../../styles/themes";
import type { Board, Snapshot } from "../../types";
import type { UpdateState } from "../updates/useUpdater";

export const PROJECT_URL = "https://github.com/grayfvll01/local-kanban-board";

interface SettingsDialogProps {
  snapshot: Snapshot;
  activeBoard?: Board;
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  update: UpdateState;
  onThemeFamilyChange: (theme: ThemeFamily) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  onClose: () => void;
  onChangeVault: () => Promise<void>;
  onOpenVault: () => Promise<void>;
  onBackup: () => Promise<void>;
  onRestore: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onImportJson: () => Promise<void>;
  onExportMarkdown: () => Promise<void>;
  onExportCsv: () => Promise<void>;
  onToggleUpdateChecks: (enabled: boolean) => Promise<void>;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onOpenUrl: (url: string) => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const { snapshot, activeBoard, update, onClose } = props;
  const panelRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useModalFocus(panelRef);

  const run = (label: string, action: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const action = (label: string, icon: ReactNode, text: string, handler: () => Promise<void>, disabled = false) => (
    <button type="button" className="toolbar-button justify-start" disabled={Boolean(busy) || disabled} onClick={run(label, handler)}>
      {busy === label ? <Loader2 size={16} className="spin" aria-hidden="true" /> : icon}
      {text}
    </button>
  );

  return (
    <div
      className="dialog-backdrop fixed inset-0 z-50 grid place-items-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="dialog-panel settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onKeyDown={(event) => handleModalKeyDown(event, panelRef.current, onClose)}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="settings-title" className="text-xl font-bold tracking-[-0.02em]">Settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings" title="Close (Esc)">
            <X size={17} />
          </button>
        </div>

        <SettingsSection title="Appearance">
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Theme</span>
              <select value={props.themeFamily} onChange={(event) => props.onThemeFamilyChange(event.target.value as ThemeFamily)}>
                {themeFamilies.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mode</span>
              <select value={props.themeMode} onChange={(event) => props.onThemeModeChange(event.target.value as ThemeMode)}>
                {themeModes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="Vault" description="Everything is stored in this folder on your computer.">
          <p className="settings-path" title={snapshot.vault_path ?? undefined}>{snapshot.vault_path}</p>
          <div className="settings-actions">
            {action("open", <FolderOpen size={16} aria-hidden="true" />, "Open folder", props.onOpenVault)}
            {action("change", <FolderInput size={16} aria-hidden="true" />, "Switch vault…", props.onChangeVault)}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Backup and restore"
          description="A backup is saved automatically once a day; the 10 most recent are kept in the vault's backups folder."
        >
          <div className="settings-actions">
            {action("backup", <DatabaseBackup size={16} aria-hidden="true" />, "Back up now", props.onBackup)}
            {action("restore", <Download size={16} aria-hidden="true" />, "Restore a backup…", props.onRestore)}
          </div>
        </SettingsSection>

        <SettingsSection title="Export and import" description="JSON includes every board and attachment. Markdown and CSV export the current board.">
          <div className="settings-actions">
            {action("json", <FileJson size={16} aria-hidden="true" />, "Export JSON", props.onExportJson)}
            {action("import", <Upload size={16} aria-hidden="true" />, "Import JSON…", props.onImportJson)}
            {action("markdown", <FileText size={16} aria-hidden="true" />, "Export Markdown", props.onExportMarkdown, !activeBoard)}
            {action("csv", <FileDown size={16} aria-hidden="true" />, "Export CSV", props.onExportCsv, !activeBoard)}
          </div>
        </SettingsSection>

        <SettingsSection title="Updates">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={snapshot.check_for_updates}
              disabled={Boolean(busy)}
              onChange={(event) => void run("toggle", () => props.onToggleUpdateChecks(event.target.checked))()}
            />
            <span>
              <strong>Check for updates automatically</strong>
              <small>Only contacts GitHub to see if a newer version exists. No data leaves your computer.</small>
            </span>
          </label>
          <div className="settings-update">
            <span className="settings-update-status" role="status">
              <UpdateStatus version={snapshot.app_version} update={update} />
            </span>
            {update.status === "available" ? (
              <button type="button" className="primary-button" onClick={props.onInstallUpdate}>
                <Download size={16} aria-hidden="true" /> Install and restart
              </button>
            ) : (
              <button
                type="button"
                className="toolbar-button"
                disabled={update.status === "checking" || update.status === "installing"}
                onClick={props.onCheckForUpdates}
              >
                <RefreshCw size={16} className={update.status === "checking" ? "spin" : undefined} aria-hidden="true" />
                Check now
              </button>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title="Keyboard shortcuts">
          <dl className="shortcut-list">
            <dt><kbd>Ctrl</kbd> <kbd>N</kbd></dt><dd>New task</dd>
            <dt><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>N</kbd></dt><dd>New column</dd>
            <dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Search</dd>
            <dt><kbd>Ctrl</kbd> <kbd>S</kbd></dt><dd>Save the open task</dd>
            <dt><kbd>Alt</kbd> <kbd>Arrows</kbd></dt><dd>Move the focused task</dd>
            <dt><kbd>Esc</kbd></dt><dd>Close dialogs and menus</dd>
          </dl>
        </SettingsSection>

        <div className="settings-about">
          <span>Local Kanban {snapshot.app_version} · MIT License</span>
          <button type="button" className="link-button" onClick={() => props.onOpenUrl(PROJECT_URL)}>
            Project page <ExternalLink size={13} aria-hidden="true" />
          </button>
          <button type="button" className="link-button" onClick={() => props.onOpenUrl(`${PROJECT_URL}/issues`)}>
            Report a problem <ExternalLink size={13} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {description ? <p className="settings-description">{description}</p> : null}
      {children}
    </section>
  );
}

function UpdateStatus({ version, update }: { version: string; update: UpdateState }) {
  switch (update.status) {
    case "checking":
      return <>Checking for updates…</>;
    case "current":
      return <>You're on the latest version ({version}).</>;
    case "available":
      return <>Version {update.version} is available. You have {version}.</>;
    case "installing":
      return <>Downloading {update.version}{update.progress !== null ? ` · ${update.progress}%` : "…"}</>;
    case "error":
      return <span className="themed-danger">{update.message}</span>;
    default:
      return <>Version {version}</>;
  }
}
