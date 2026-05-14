import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import {
  AlertTriangle,
  DatabaseBackup,
  Download,
  FileDown,
  FileJson,
  FileText,
  FolderOpen,
  HardDrive,
  Moon,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { api } from "./db/api";
import { BoardSidebar } from "./features/boards/BoardSidebar";
import { CardDrawer } from "./features/cards/CardDrawer";
import { KanbanBoard } from "./features/cards/KanbanBoard";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  applyThemeTokens,
  legacyThemeMode,
  normalizeThemeFamily,
  normalizeThemeMode,
  resolveThemeMode,
  themeFamilies,
  themeModes,
  type ThemeFamily,
  type ThemeMode,
} from "./styles/themes";
import type { Board, Card, CardInput, Column, Priority, Snapshot } from "./types";

interface Filters {
  tag: string;
  priority: "all" | Priority;
  due: "all" | "overdue" | "today" | "none";
  column: string;
}

const defaultFilters: Filters = { tag: "", priority: "all", due: "all", column: "all" };

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const [entityDialog, setEntityDialog] = useState<EntityDialogState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastPath, setLastPath] = useState<string>();
  const [themeFamily, setThemeFamily] = useState<ThemeFamily>("default");
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [notice, setNotice] = useState("Loading local workspace...");
  const searchRef = useRef<HTMLInputElement>(null);

  const applySnapshot = useCallback(async (data: Snapshot) => {
    setSnapshot(data);
    if (data.vault_required) {
      setSelectedBoardId("");
      setNotice(data.status_error ?? "Choose a vault folder to start using local-kanban-word.");
      return;
    }
    const storedFilters = safeJson<Filters>(data.settings.filters, defaultFilters);
    setFilters(storedFilters);
    setSearch(data.settings.search ?? "");
    const selected = data.settings.selected_board_id || data.boards[0]?.id || "";
    setSelectedBoardId(selected);
    const nextThemeFamily = normalizeThemeFamily(data.settings.theme_family ?? data.settings.theme);
    const nextThemeMode = normalizeThemeMode(
      data.settings.theme_mode ?? legacyThemeMode(data.settings.theme),
    );
    setThemeFamily(nextThemeFamily);
    setThemeMode(nextThemeMode);
    applyThemeTokens(nextThemeFamily, nextThemeMode);
    setNotice("Ready");
    await restoreWindowState(data.settings.window_state);
  }, []);

  const load = useCallback(async () => {
    const data = await api.loadSnapshot();
    await applySnapshot(data);
  }, [applySnapshot]);

  const chooseVault = useCallback(async () => {
    const data = await api.chooseVaultFolder();
    await applySnapshot(data);
    setNotice(`Vault active: ${data.vault_path}`);
  }, [applySnapshot]);

  const changeVault = useCallback(async () => {
    const ok = window.confirm(
      "local-kanban-word will switch to another vault folder. The previous vault will not be deleted.",
    );
    if (!ok) return;
    if (snapshot && !snapshot.vault_required) {
      await api.saveSetting("search", search);
      await api.saveSetting("filters", JSON.stringify(filters));
    }
    await chooseVault();
  }, [chooseVault, filters, search, snapshot]);

  useEffect(() => {
    void load().catch((error) => setNotice(String(error)));
  }, [load]);

  useEffect(() => {
    if (!selectedBoardId) return;
    void api.saveSetting("selected_board_id", selectedBoardId);
  }, [selectedBoardId]);

  useEffect(() => {
    if (!snapshot || snapshot.vault_required) return;
    const timeout = window.setTimeout(() => {
      void api.saveSetting("search", search);
      void api.saveSetting("filters", JSON.stringify(filters));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters, search, snapshot]);

  useEffect(() => {
    const saveWindowState = async () => {
      try {
        const appWindow = getCurrentWindow();
        const size = await appWindow.innerSize();
        const position = await appWindow.outerPosition();
        await api.saveSetting(
          "window_state",
          JSON.stringify({
            width: size.width,
            height: size.height,
            x: position.x,
            y: position.y,
          }),
        );
      } catch {
        // Window persistence is best-effort because browser previews do not expose native windows.
      }
    };
    window.addEventListener("beforeunload", saveWindowState);
    return () => window.removeEventListener("beforeunload", saveWindowState);
  }, []);

  useEffect(() => {
    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeTokens(themeFamily, "system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeFamily, themeMode]);

  const boards = snapshot?.boards ?? [];
  const columns = useMemo(
    () =>
      (snapshot?.columns ?? [])
        .filter((column) => column.board_id === selectedBoardId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [snapshot?.columns, selectedBoardId],
  );
  const cards = useMemo(
    () =>
      (snapshot?.cards ?? [])
        .filter((card) => card.board_id === selectedBoardId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [snapshot?.cards, selectedBoardId],
  );
  const activeBoard = boards.find((board) => board.id === selectedBoardId);
  const activeCard = activeCardId ? snapshot?.cards.find((card) => card.id === activeCardId) : null;
  const visibleCards = useMemo(
    () => filterCards(cards, search, filters),
    [cards, filters, search],
  );

  const createCard = useCallback(
    (columnId: string) => {
      if (!activeBoard || !columnId) return;
      setNewCardColumnId(columnId);
      setActiveCardId("new");
    },
    [activeBoard],
  );

  useKeyboardShortcuts({
    onNewColumn: () => {
      if (activeBoard) setEntityDialog({ type: "column" });
    },
    onSearch: () => searchRef.current?.focus(),
    onSave: () => document.dispatchEvent(new Event("kanban-save-card")),
    onEscape: () => {
      setActiveCardId(null);
      setNewCardColumnId(null);
      setEntityDialog(null);
    },
  });

  const mutateSnapshot = (updater: (snapshot: Snapshot) => Snapshot) => {
    setSnapshot((current) => (current ? updater(current) : current));
  };

  const saveCard = async (input: CardInput) => {
    const saved = await api.upsertCard(input);
    mutateSnapshot((current) => {
      const cards = current.cards.filter((card) => card.id !== saved.id).concat(saved);
      return { ...current, cards };
    });
    setActiveCardId(saved.id);
    setNotice("Card saved");
    return saved;
  };

  const deleteCard = async (id: string) => {
    await api.deleteCard(id);
    mutateSnapshot((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== id) }));
    setNotice("Card deleted");
  };

  const reorderCards = async (nextCards: Card[]) => {
    const normalized = normalizeCardOrder(nextCards, columns);
    mutateSnapshot((current) => ({
      ...current,
      cards: current.cards.map((card) => normalized.find((item) => item.id === card.id) ?? card),
    }));
    await api.reorderCards(
      normalized.map((card) => ({
        id: card.id,
        column_id: card.column_id,
        sort_order: card.sort_order,
      })),
    );
    setNotice("Card order saved");
  };

  const openEntityDialog = (state: EntityDialogState) => setEntityDialog(state);

  const handleEntitySave = async (values: { name: string; description?: string; wipLimit?: string }) => {
    if (!entityDialog || !values.name.trim()) return;
    if (entityDialog.type === "board") {
      if (entityDialog.entity) {
        const board = await api.updateBoard({
          id: entityDialog.entity.id,
          name: values.name,
          description: values.description ?? "",
        });
        mutateSnapshot((current) => ({
          ...current,
          boards: current.boards.map((item) => (item.id === board.id ? board : item)),
        }));
      } else {
        const board = await api.createBoard(values.name, values.description ?? "");
        await load();
        setSelectedBoardId(board.id);
      }
    } else {
      if (entityDialog.entity) {
        const column = await api.updateColumn({
          id: entityDialog.entity.id,
          name: values.name,
          wip_limit: values.wipLimit ? Number(values.wipLimit) : null,
        });
        mutateSnapshot((current) => ({
          ...current,
          columns: current.columns.map((item) => (item.id === column.id ? column : item)),
        }));
      } else if (activeBoard) {
        const column = await api.createColumn(activeBoard.id, values.name);
        mutateSnapshot((current) => ({ ...current, columns: current.columns.concat(column) }));
      }
    }
    setEntityDialog(null);
    setNotice("Changes saved");
  };

  const toggleTheme = async () => {
    const next = resolveThemeMode(themeMode) === "dark" ? "light" : "dark";
    setThemeMode(next);
    applyThemeTokens(themeFamily, next);
    if (!snapshot?.vault_required) {
      await api.saveSetting("theme_mode", next);
    }
  };

  const changeThemeFamily = async (next: ThemeFamily) => {
    setThemeFamily(next);
    applyThemeTokens(next, themeMode);
    await api.saveSetting("theme_family", next);
  };

  const changeThemeMode = async (next: ThemeMode) => {
    setThemeMode(next);
    applyThemeTokens(themeFamily, next);
    await api.saveSetting("theme_mode", next);
  };

  if (!snapshot) {
    return <div className="app-shell themed-muted grid h-screen place-items-center">{notice}</div>;
  }

  if (snapshot.vault_required) {
    return (
      <div className="app-shell grid h-screen place-items-center p-6">
        <VaultSetup
          error={snapshot.status_error}
          configPath={snapshot.config_path}
          onChoose={chooseVault}
        />
      </div>
    );
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <BoardSidebar
        boards={boards}
        selectedBoardId={selectedBoardId}
        onSelect={setSelectedBoardId}
        onCreate={() => openEntityDialog({ type: "board" })}
        onEdit={(board) => openEntityDialog({ type: "board", entity: board })}
        onDelete={async (id) => {
          await api.deleteBoard(id);
          await load();
          setNotice("Board deleted");
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="topbar">
          <div className="min-w-0">
            <h2 className="themed-title truncate text-2xl font-semibold">
              {activeBoard?.name ?? "No board selected"}
            </h2>
            {activeBoard?.description ? (
              <p className="themed-muted truncate text-sm">{activeBoard.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="searchbox">
              <Search size={17} />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title or description"
              />
            </div>
            <button className="toolbar-button" onClick={() => setShowFilters((value) => !value)}>
              <SlidersHorizontal size={16} />
              Filter
            </button>
            <button
              className="toolbar-button"
              disabled={!activeBoard}
              onClick={() => openEntityDialog({ type: "column" })}
            >
              <Plus size={16} />
              New Column
            </button>
            <button className="toolbar-button" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} />
              Settings
            </button>
            <button className="icon-button" onClick={toggleTheme} title="Toggle theme">
              {resolveThemeMode(themeMode) === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-button" onClick={() => void load()} title="Reload from vault">
              <RefreshCcw size={16} />
            </button>
          </div>
        </header>

        {showFilters ? (
          <section className="filterbar">
            <label>
              <span>Tag</span>
              <input
                value={filters.tag}
                onChange={(event) => setFilters({ ...filters, tag: event.target.value })}
                placeholder="release"
              />
            </label>
            <label>
              <span>Priority</span>
              <select
                value={filters.priority}
                onChange={(event) =>
                  setFilters({ ...filters, priority: event.target.value as Filters["priority"] })
                }
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              <span>Due</span>
              <select
                value={filters.due}
                onChange={(event) => setFilters({ ...filters, due: event.target.value as Filters["due"] })}
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="none">No date</option>
              </select>
            </label>
            <label>
              <span>Column</span>
              <select
                value={filters.column}
                onChange={(event) => setFilters({ ...filters, column: event.target.value })}
              >
                <option value="all">All</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="toolbar-button self-end" onClick={() => setFilters(defaultFilters)}>
              Reset
            </button>
          </section>
        ) : null}

        <div className="min-h-0 flex-1">
          {activeBoard && columns.length ? (
            <KanbanBoard
              columns={columns}
              cards={cards}
              visibleCards={visibleCards}
              onOpenCard={(card) => setActiveCardId(card.id)}
              onCreateCard={createCard}
              onEditColumn={(column) => openEntityDialog({ type: "column", entity: column })}
              onDeleteColumn={async (id) => {
                await api.deleteColumn(id);
                mutateSnapshot((current) => ({
                  ...current,
                  columns: current.columns.filter((column) => column.id !== id),
                  cards: current.cards.filter((card) => card.column_id !== id),
                }));
                setNotice("Column deleted");
              }}
              onReorderCards={reorderCards}
            />
          ) : (
            <EmptyState
              title={activeBoard ? "Add your first column" : "Create a board"}
              body="Your workspace is fully local. Boards, cards, attachments, order, and settings stay in your selected vault."
              action={activeBoard ? undefined : "New board"}
              onAction={activeBoard ? undefined : () => openEntityDialog({ type: "board" })}
            />
          )}
        </div>
      </main>

      {activeCardId ? (
        <CardDrawer
          card={activeCardId === "new" ? null : activeCard}
          boardId={selectedBoardId}
          columns={columns}
          defaultColumnId={newCardColumnId ?? columns[0]?.id}
          onClose={() => {
            setActiveCardId(null);
            setNewCardColumnId(null);
          }}
          onSave={saveCard}
          onDelete={deleteCard}
          onReload={load}
        />
      ) : null}

      {entityDialog ? (
        <EntityDialog
          state={entityDialog}
          onClose={() => setEntityDialog(null)}
          onSave={handleEntitySave}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          snapshot={snapshot}
          activeBoard={activeBoard}
          lastPath={lastPath}
          themeFamily={themeFamily}
          themeMode={themeMode}
          onThemeFamilyChange={changeThemeFamily}
          onThemeModeChange={changeThemeMode}
          onClose={() => setSettingsOpen(false)}
          onChangeVault={changeVault}
          onOpenVault={() => void api.openVaultFolder()}
          onBackup={async () => {
            const path = await api.backupDatabase();
            setLastPath(path);
            setNotice(`Backup created: ${path}`);
          }}
          onExportJson={async () => {
            const path = await api.exportJson();
            setLastPath(path);
            setNotice(`JSON exported: ${path}`);
          }}
          onImportJson={async (file) => {
            await api.importJson(await file.text());
            await load();
            setNotice("JSON import complete");
          }}
          onExportMarkdown={async () => {
            if (!activeBoard) return;
            const path = await api.exportBoardMarkdown(activeBoard.id);
            setLastPath(path);
            setNotice(`Markdown exported: ${path}`);
          }}
          onExportCsv={async () => {
            if (!activeBoard) return;
            const path = await api.exportBoardCsv(activeBoard.id);
            setLastPath(path);
            setNotice(`CSV exported: ${path}`);
          }}
          onRestore={async (file) => {
            await api.restoreDatabase(await fileToBase64(file));
            await load();
            setNotice("Backup restored");
          }}
          onOpenPath={(path) => void api.openPath(path)}
        />
      ) : null}
    </div>
  );
}

type EntityDialogState =
  | { type: "board"; entity?: Board }
  | { type: "column"; entity?: Column };

function VaultSetup({
  error,
  configPath,
  onChoose,
}: {
  error?: string | null;
  configPath: string;
  onChoose: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="vault-panel">
      <div className="themed-icon-tile mx-auto grid h-14 w-14 place-items-center rounded-2xl">
        <HardDrive size={28} />
      </div>
      <h1 className="themed-title mt-5 text-center text-2xl font-semibold">Choose a Kanban vault</h1>
      <p className="themed-muted mt-3 text-center text-sm leading-6">
        Your vault is the local folder that stores your boards, attachments, backups, and exports.
      </p>
      {error ? (
        <div className="themed-surface-subtle mt-5 flex gap-3 rounded-lg p-3 text-sm themed-warning">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          <span>{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="themed-surface-subtle themed-danger mt-5 rounded-lg p-3 text-sm">
          {message}
        </div>
      ) : null}
      <button
        className="primary-button mt-6 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await onChoose();
          } catch (error) {
            setMessage(String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FolderOpen size={17} />
        {busy ? "Opening..." : "Choose or create folder"}
      </button>
      <p className="themed-muted mt-4 break-all text-center text-xs">
        Vault choice is remembered in {configPath}
      </p>
    </section>
  );
}

function SettingsDialog({
  snapshot,
  activeBoard,
  lastPath,
  themeFamily,
  themeMode,
  onThemeFamilyChange,
  onThemeModeChange,
  onClose,
  onChangeVault,
  onOpenVault,
  onBackup,
  onExportJson,
  onImportJson,
  onExportMarkdown,
  onExportCsv,
  onRestore,
  onOpenPath,
}: {
  snapshot: Snapshot;
  activeBoard?: Board;
  lastPath?: string;
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  onThemeFamilyChange: (theme: ThemeFamily) => Promise<void>;
  onThemeModeChange: (mode: ThemeMode) => Promise<void>;
  onClose: () => void;
  onChangeVault: () => Promise<void>;
  onOpenVault: () => void;
  onBackup: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onImportJson: (file: File) => Promise<void>;
  onExportMarkdown: () => Promise<void>;
  onExportCsv: () => Promise<void>;
  onRestore: (file: File) => Promise<void>;
  onOpenPath: (path: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const run = async (label: string, action: () => Promise<void> | void) => {
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center backdrop-blur-sm" onMouseDown={onClose}>
      <section className="dialog-panel settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void run("import", () => onImportJson(file));
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={restoreRef}
          type="file"
          accept=".sqlite,.sqlite3,.db,application/octet-stream"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void run("restore", () => onRestore(file));
            event.currentTarget.value = "";
          }}
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="themed-accent text-xs font-semibold uppercase tracking-[0.22em]">Settings</p>
            <h2 className="themed-title mt-1 text-lg font-semibold">Vault Management</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close settings">
            <X size={17} />
          </button>
        </div>

        <div className="themed-panel mt-5 rounded-lg p-4">
          <span className="themed-label text-xs font-semibold uppercase">
            Current vault
          </span>
          <p className="themed-subtitle mt-2 break-all text-sm">{snapshot.vault_path}</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="field">
            <span>Theme</span>
            <select
              value={themeFamily}
              onChange={(event) => void onThemeFamilyChange(event.target.value as ThemeFamily)}
            >
              {themeFamilies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mode</span>
            <select
              value={themeMode}
              onChange={(event) => void onThemeModeChange(event.target.value as ThemeMode)}
            >
              {themeModes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={() => run("change", onChangeVault)}>
            <FolderOpen size={16} />
            Change vault
          </button>
          <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={onOpenVault}>
            <FolderOpen size={16} />
            Open vault
          </button>
          <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={() => run("backup", onBackup)}>
            <DatabaseBackup size={16} />
            Backup vault data
          </button>
          <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={() => run("json", onExportJson)}>
            <FileJson size={16} />
            Export JSON
          </button>
          <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={() => importRef.current?.click()}>
            <Upload size={16} />
            Import JSON
          </button>
          <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={() => restoreRef.current?.click()}>
            <Download size={16} />
            Restore backup
          </button>
          <button
            className="toolbar-button justify-start"
            disabled={Boolean(busy) || !activeBoard}
            onClick={() => run("markdown", onExportMarkdown)}
          >
            <FileText size={16} />
            Export Markdown
          </button>
          <button
            className="toolbar-button justify-start"
            disabled={Boolean(busy) || !activeBoard}
            onClick={() => run("csv", onExportCsv)}
          >
            <FileDown size={16} />
            Export CSV
          </button>
          {lastPath ? (
            <button className="toolbar-button justify-start" disabled={Boolean(busy)} onClick={() => onOpenPath(lastPath)}>
              Open last file
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EntityDialog({
  state,
  onClose,
  onSave,
}: {
  state: EntityDialogState;
  onClose: () => void;
  onSave: (values: { name: string; description?: string; wipLimit?: string }) => void;
}) {
  const [name, setName] = useState(state.entity?.name ?? "");
  const [description, setDescription] = useState(state.type === "board" ? state.entity?.description ?? "" : "");
  const [wipLimit, setWipLimit] = useState(
    state.type === "column" && state.entity?.wip_limit ? String(state.entity.wip_limit) : "",
  );

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center backdrop-blur-sm" onMouseDown={onClose}>
      <form
        className="dialog-panel"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name, description, wipLimit });
        }}
      >
        <h2 className="themed-title text-lg font-semibold">
          {state.entity ? "Edit" : "New"} {state.type}
        </h2>
        <label className="field mt-5">
          <span>Name</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {state.type === "board" ? (
          <label className="field mt-3">
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        ) : (
          <label className="field mt-3">
            <span>WIP limit</span>
            <input
              type="number"
              min="0"
              value={wipLimit}
              onChange={(event) => setWipLimit(event.target.value)}
              placeholder="Optional"
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="toolbar-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function normalizeCardOrder(cards: Card[], columns: Column[]) {
  return columns.flatMap((column) =>
    cards
      .filter((card) => card.column_id === column.id)
      .map((card, index) => ({ ...card, sort_order: index * 1000 })),
  );
}

function filterCards(cards: Card[], search: string, filters: Filters) {
  const query = search.trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  return cards.filter((card) => {
    if (query && !`${card.title} ${card.description}`.toLowerCase().includes(query)) return false;
    if (filters.tag && !card.tags.some((tag) => tag.includes(filters.tag.toLowerCase()))) return false;
    if (filters.priority !== "all" && card.priority !== filters.priority) return false;
    if (filters.column !== "all" && card.column_id !== filters.column) return false;
    if (filters.due === "none" && card.due_date) return false;
    if (filters.due === "today" && card.due_date !== today) return false;
    if (filters.due === "overdue" && (!card.due_date || card.due_date >= today)) return false;
    return true;
  });
}

function safeJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function restoreWindowState(value?: string) {
  const state = safeJson<{ width: number; height: number; x: number; y: number } | null>(value, null);
  if (!state) return;
  try {
    const appWindow = getCurrentWindow();
    await appWindow.setSize(new LogicalSize(state.width, state.height));
    await appWindow.setPosition(new LogicalPosition(state.x, state.y));
  } catch {
    // Native window APIs are unavailable when the UI is opened outside Tauri.
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}
