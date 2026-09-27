import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  Loader2,
  Menu as MenuIcon,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "./components/ConfirmDialog";
import { Dialog } from "./components/Dialog";
import { EmptyState } from "./components/EmptyState";
import { api, errorMessage, isBrowserPreview } from "./db/api";
import { BoardSidebar } from "./features/boards/BoardSidebar";
import { CardDrawer } from "./features/cards/CardDrawer";
import { KanbanBoard } from "./features/cards/KanbanBoard";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { useUpdater } from "./features/updates/useUpdater";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  activeFilterCount as countFilters,
  defaultFilters,
  filterCards,
  moveItem,
  normalizeFilters,
  orderChanges,
  sortByOrder,
  type Filters,
} from "./lib/board";
import { cn } from "./lib/cn";
import {
  applyThemeTokens,
  legacyThemeMode,
  normalizeThemeFamily,
  normalizeThemeMode,
  resolveThemeMode,
  type ThemeFamily,
  type ThemeMode,
} from "./styles/themes";
import type { Board, Card, CardInput, Column, Snapshot } from "./types";

type StatusKind = "info" | "success" | "error";
interface Status {
  kind: StatusKind;
  message: string;
  path?: string;
}

type EntityDialogState = { type: "board"; entity?: Board } | { type: "column"; entity?: Column };

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ session: number; cardId: string | null; columnId?: string } | null>(null);
  const [entityDialog, setEntityDialog] = useState<EntityDialogState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeFamily, setThemeFamily] = useState<ThemeFamily>("default");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [status, setStatus] = useState<Status>({ kind: "info", message: "Ready" });
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(0);
  const confirm = useConfirm();
  const updater = useUpdater(Boolean(snapshot?.check_for_updates));

  const notify = useCallback((kind: StatusKind, message: string, path?: string) => {
    setStatus({ kind, message, path });
    if (kind === "error") setToast(message);
  }, []);

  const applySnapshot = useCallback((data: Snapshot) => {
    setSnapshot(data);
    setLoadError(null);
    if (data.vault_required) {
      setSelectedBoardId("");
      applyThemeTokens("default", "system");
      return;
    }
    setFilters(normalizeFilters(safeJson(data.settings.filters)));
    setSearch(data.settings.search ?? "");
    const stored = data.settings.selected_board_id;
    setSelectedBoardId(data.boards.some((board) => board.id === stored) ? stored! : data.boards[0]?.id ?? "");
    const family = normalizeThemeFamily(data.settings.theme_family ?? data.settings.theme);
    const mode = normalizeThemeMode(data.settings.theme_mode ?? legacyThemeMode(data.settings.theme));
    setThemeFamily(family);
    setThemeMode(mode);
    applyThemeTokens(family, mode);
  }, []);

  const load = useCallback(async () => {
    applySnapshot(await api.loadSnapshot());
  }, [applySnapshot]);

  const reload = useCallback(() => {
    load().catch((error) => notify("error", `Couldn't reload the vault: ${errorMessage(error)}`));
  }, [load, notify]);

  /** Runs a user action and reports failures instead of letting them disappear. */
  const run = useCallback(
    async <T,>(action: () => Promise<T>, onError: "report" | "reload" = "report"): Promise<T | undefined> => {
      try {
        return await action();
      } catch (error) {
        notify("error", errorMessage(error));
        if (onError === "reload") reload();
        return undefined;
      }
    },
    [notify, reload],
  );

  useEffect(() => {
    load().catch((error) => setLoadError(errorMessage(error)));
  }, [load]);

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      notify("error", errorMessage(event.reason));
    };
    // Dropping a file outside the task drawer must never navigate the window away.
    const blockFileDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("dragover", blockFileDrop);
    window.addEventListener("drop", blockFileDrop);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("dragover", blockFileDrop);
      window.removeEventListener("drop", blockFileDrop);
    };
  }, [notify]);

  const vaultOpen = Boolean(snapshot && !snapshot.vault_required);

  useEffect(() => {
    if (!vaultOpen || !selectedBoardId) return;
    api.saveSetting("selected_board_id", selectedBoardId).catch(() => undefined);
  }, [selectedBoardId, vaultOpen]);

  useEffect(() => {
    if (!vaultOpen) return;
    const timeout = window.setTimeout(() => {
      api.saveSetting("search", search).catch(() => undefined);
      api.saveSetting("filters", JSON.stringify(filters)).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters, search, vaultOpen]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeTokens(themeFamily, "system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeFamily, themeMode]);

  const boards = snapshot?.boards ?? [];
  const columns = useMemo(
    () => sortByOrder((snapshot?.columns ?? []).filter((column) => column.board_id === selectedBoardId)),
    [snapshot?.columns, selectedBoardId],
  );
  const cards = useMemo(
    () => sortByOrder((snapshot?.cards ?? []).filter((card) => card.board_id === selectedBoardId)),
    [snapshot?.cards, selectedBoardId],
  );
  const activeBoard = boards.find((board) => board.id === selectedBoardId);
  const visibleCards = useMemo(() => filterCards(cards, search, filters), [cards, filters, search]);
  const cardCounts = useMemo(
    () =>
      (snapshot?.cards ?? []).reduce<Record<string, number>>((counts, card) => {
        counts[card.board_id] = (counts[card.board_id] ?? 0) + 1;
        return counts;
      }, {}),
    [snapshot?.cards],
  );
  const filterCount = countFilters(filters);
  const drawerCard = drawer?.cardId ? snapshot?.cards.find((card) => card.id === drawer.cardId) ?? null : null;

  // Close the drawer if its task disappeared (for example after a restore).
  useEffect(() => {
    if (drawer?.cardId && snapshot && !drawerCard) setDrawer(null);
  }, [drawer?.cardId, drawerCard, snapshot]);

  const openCard = (cardId: string | null, columnId?: string) => {
    sessionRef.current += 1;
    setDrawer({ session: sessionRef.current, cardId, columnId });
  };

  const createCard = (columnId?: string) => {
    const target = columnId ?? columns[0]?.id;
    if (!activeBoard || !target) return;
    openCard(null, target);
  };

  useKeyboardShortcuts({
    onNewCard: () => createCard(),
    onNewColumn: () => {
      if (activeBoard) setEntityDialog({ type: "column" });
    },
    onSearch: () => searchRef.current?.focus(),
  });

  const mutateSnapshot = (updater: (current: Snapshot) => Snapshot) => {
    setSnapshot((current) => (current ? updater(current) : current));
  };

  const saveCard = async (input: CardInput) => {
    const saved = await api.upsertCard(input);
    mutateSnapshot((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== saved.id).concat(saved),
    }));
    setDrawer((current) => (current ? { ...current, cardId: saved.id } : current));
    notify("success", input.id ? "Task saved" : "Task created");
    return saved;
  };

  const deleteCard = async (id: string) => {
    await api.deleteCard(id);
    mutateSnapshot((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== id) }));
    notify("success", "Task deleted");
  };

  const reorderCards = (nextCards: Card[], announcement: string) => {
    const changes = orderChanges(cards, nextCards);
    if (!changes.length) return;
    const byId = new Map(nextCards.map((card) => [card.id, card]));
    mutateSnapshot((current) => ({ ...current, cards: current.cards.map((card) => byId.get(card.id) ?? card) }));
    void run(async () => {
      await api.reorderCards(changes);
      notify("success", announcement);
    }, "reload");
  };

  const moveColumn = (columnId: string, direction: "left" | "right") => {
    const index = columns.findIndex((column) => column.id === columnId);
    const target = index + (direction === "left" ? -1 : 1);
    if (index < 0 || target < 0 || target >= columns.length) return;
    const ordered = moveItem(columns, index, target);
    const orders = new Map(ordered.map((column, position) => [column.id, position * 1000]));
    mutateSnapshot((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        orders.has(column.id) ? { ...column, sort_order: orders.get(column.id)! } : column,
      ),
    }));
    void run(async () => {
      await api.reorderColumns(selectedBoardId, ordered.map((column) => column.id));
      notify("success", `Moved “${columns[index].name}” ${direction}`);
    }, "reload");
  };

  const saveEntity = async (values: { name: string; description: string; wipLimit: number | null }) => {
    if (!entityDialog) return;
    if (entityDialog.type === "board") {
      if (entityDialog.entity) {
        const board = await api.updateBoard({ id: entityDialog.entity.id, name: values.name, description: values.description });
        mutateSnapshot((current) => ({ ...current, boards: current.boards.map((item) => (item.id === board.id ? board : item)) }));
        notify("success", "Board updated");
      } else {
        const board = await api.createBoard(values.name, values.description);
        await load();
        setSelectedBoardId(board.id);
        notify("success", `Created “${board.name}”`);
      }
    } else if (entityDialog.entity) {
      const column = await api.updateColumn({ id: entityDialog.entity.id, name: values.name, wip_limit: values.wipLimit });
      mutateSnapshot((current) => ({ ...current, columns: current.columns.map((item) => (item.id === column.id ? column : item)) }));
      notify("success", "Column updated");
    } else if (activeBoard) {
      const column = await api.createColumn(activeBoard.id, values.name);
      mutateSnapshot((current) => ({ ...current, columns: current.columns.concat(column) }));
      notify("success", `Added “${column.name}”`);
    }
    setEntityDialog(null);
  };

  const changeThemeFamily = (next: ThemeFamily) => {
    setThemeFamily(next);
    applyThemeTokens(next, themeMode);
    api.saveSetting("theme_family", next).catch(() => undefined);
  };

  const changeThemeMode = (next: ThemeMode) => {
    setThemeMode(next);
    applyThemeTokens(themeFamily, next);
    api.saveSetting("theme_mode", next).catch(() => undefined);
  };

  const exported = (label: string) => async (path: string) => notify("success", `${label} saved`, path);

  const installUpdate = async () => {
    if (updater.state.status !== "available") return;
    const ok = await confirm({
      title: `Install version ${updater.state.version}?`,
      message: "Local Kanban will close, install the update, and reopen. Your boards are already saved. Unsaved edits in an open task will be lost.",
      confirmLabel: "Install and restart",
    });
    if (ok) {
      setDrawer(null);
      await updater.install();
    }
  };

  if (!snapshot) {
    return (
      <div className="app-shell grid h-screen place-items-center p-6">
        {loadError ? (
          <section className="vault-panel text-center" role="alert">
            <AlertTriangle className="themed-danger mx-auto" size={28} aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold">Local Kanban couldn't start</h1>
            <p className="themed-muted mt-3 break-words text-sm">{loadError}</p>
            <button className="primary-button mt-6" onClick={() => { setLoadError(null); load().catch((error) => setLoadError(errorMessage(error))); }}>
              Try again
            </button>
          </section>
        ) : (
          <div className="loading-state" role="status">
            <span className="loading-mark"><span /></span>
            <strong>Opening your workspace</strong>
          </div>
        )}
      </div>
    );
  }

  if (snapshot.vault_required) {
    return (
      <div className="app-shell grid h-screen place-items-center overflow-y-auto p-6">
        <VaultSetup
          error={snapshot.status_error}
          configPath={snapshot.config_path}
          onChoose={async () => {
            const data = await api.chooseVaultFolder();
            if (data) applySnapshot(data);
          }}
        />
      </div>
    );
  }

  const statusIcon =
    status.kind === "error" ? <AlertTriangle size={14} aria-hidden="true" /> : status.kind === "success" ? <CheckCircle2 size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <BoardSidebar
        boards={boards}
        cardCounts={cardCounts}
        selectedBoardId={selectedBoardId}
        vaultPath={snapshot.vault_path}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        onSelect={setSelectedBoardId}
        onCreate={() => setEntityDialog({ type: "board" })}
        onEdit={(board) => setEntityDialog({ type: "board", entity: board })}
        onDelete={(id) =>
          void run(async () => {
            await api.deleteBoard(id);
            await load();
            notify("success", "Board deleted");
          }, "reload")
        }
        onOpenVault={() => void run(api.openVaultFolder)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="mobile-nav-button icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
              <MenuIcon size={19} />
            </button>
            <div className="board-heading-mark" aria-hidden="true"><span /></div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="themed-label text-[10px] font-bold uppercase">Board</span>
                {activeBoard ? <span className="board-task-count">{cards.length} {cards.length === 1 ? "task" : "tasks"}</span> : null}
              </div>
              <h1 className="truncate text-xl font-bold tracking-[-0.025em]" title={activeBoard?.name}>
                {activeBoard?.name ?? "No board selected"}
              </h1>
              {activeBoard?.description ? <p className="themed-muted mt-0.5 truncate text-xs">{activeBoard.description}</p> : null}
            </div>
          </div>
          <div className="topbar-actions">
            <div className="searchbox">
              <Search size={17} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && search) {
                    event.preventDefault();
                    setSearch("");
                  }
                }}
                placeholder="Search tasks"
                aria-label="Search tasks"
              />
              <kbd aria-hidden="true">Ctrl K</kbd>
            </div>
            <button
              type="button"
              className={cn("toolbar-button filter-button", (showFilters || filterCount > 0) && "is-active")}
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
              aria-controls="task-filters"
              aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="toolbar-label">Filter</span>
              {filterCount ? <span className="filter-count" aria-hidden="true">{filterCount}</span> : null}
            </button>
            <button
              type="button"
              className="primary-button new-task-button"
              disabled={!activeBoard || !columns.length}
              onClick={() => createCard()}
              aria-label="New task"
              title="New task (Ctrl+N)"
            >
              <Plus size={16} aria-hidden="true" />
              <span className="toolbar-label">New task</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => changeThemeMode(resolveThemeMode(themeMode) === "dark" ? "light" : "dark")}
              title={resolveThemeMode(themeMode) === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={resolveThemeMode(themeMode) === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolveThemeMode(themeMode) === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {showFilters ? (
          <section id="task-filters" className="filterbar" aria-label="Task filters">
            <div className="filterbar-summary">
              <span><SlidersHorizontal size={15} aria-hidden="true" /> Filters</span>
              <small>{visibleCards.length} of {cards.length} tasks shown</small>
            </div>
            <label>
              <span>Tag</span>
              <input value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })} placeholder="e.g. release" />
            </label>
            <label>
              <span>Priority</span>
              <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value as Filters["priority"] })}>
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              <span>Due</span>
              <select value={filters.due} onChange={(event) => setFilters({ ...filters, due: event.target.value as Filters["due"] })}>
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="none">No date</option>
              </select>
            </label>
            <label>
              <span>Column</span>
              <select value={filters.column} onChange={(event) => setFilters({ ...filters, column: event.target.value })}>
                <option value="all">All</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>{column.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="clear-filter-button" onClick={() => setFilters(defaultFilters)} disabled={!filterCount}>
              <X size={15} aria-hidden="true" /> Clear
            </button>
          </section>
        ) : null}

        <div className="board-stage min-h-0 flex-1">
          {activeBoard && columns.length ? (
            <KanbanBoard
              columns={columns}
              cards={cards}
              visibleCards={visibleCards}
              onOpenCard={(card) => openCard(card.id)}
              onCreateCard={createCard}
              onCreateColumn={() => setEntityDialog({ type: "column" })}
              onEditColumn={(column) => setEntityDialog({ type: "column", entity: column })}
              onDeleteColumn={(id) =>
                void run(async () => {
                  await api.deleteColumn(id);
                  mutateSnapshot((current) => ({
                    ...current,
                    columns: current.columns.filter((column) => column.id !== id),
                    cards: current.cards.filter((card) => card.column_id !== id),
                  }));
                  notify("success", "Column deleted");
                }, "reload")
              }
              onMoveColumn={moveColumn}
              onReorderCards={reorderCards}
            />
          ) : (
            <EmptyState
              title={activeBoard ? "Add your first column" : "Create a board"}
              body={activeBoard ? "Columns shape your workflow. Try To do, In progress, and Done." : "Create a focused space for a project, routine, or idea. Everything stays in your vault."}
              action={activeBoard ? "Add a column" : "Create a board"}
              onAction={() => setEntityDialog({ type: activeBoard ? "column" : "board" })}
            />
          )}
        </div>
        <footer className="statusbar">
          <span className={cn("status-message", `is-${status.kind}`)} role="status" aria-live="polite">
            {statusIcon}
            <span className="truncate">{status.message}</span>
            {status.path ? (
              <button type="button" className="link-button" onClick={() => void run(() => api.revealPath(status.path!))}>
                Show in folder
              </button>
            ) : null}
          </span>
          <span className="status-summary">
            {updater.state.status === "available" ? (
              <button type="button" className="update-pill" onClick={() => void installUpdate()}>
                <Download size={12} aria-hidden="true" /> Update to {updater.state.version}
              </button>
            ) : null}
            {updater.state.status === "installing" ? (
              <span className="update-pill is-busy" role="status">
                <Loader2 size={12} className="spin" aria-hidden="true" /> Updating{updater.state.progress !== null ? ` ${updater.state.progress}%` : "…"}
              </span>
            ) : null}
            <span>{search || filterCount ? `${visibleCards.length} of ${cards.length} shown` : `${cards.length} ${cards.length === 1 ? "task" : "tasks"}`}</span>
            <span aria-hidden="true">•</span>
            <span>Saved locally</span>
          </span>
        </footer>
      </main>

      {toast ? (
        <div className="toast toast-danger" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{toast}</span>
          <button type="button" className="icon-button-subtle" aria-label="Dismiss message" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      ) : null}

      {drawer ? (
        <CardDrawer
          key={drawer.session}
          card={drawerCard}
          boardId={selectedBoardId}
          columns={columns}
          defaultColumnId={drawer.columnId ?? columns[0]?.id}
          onClose={() => setDrawer(null)}
          onSave={saveCard}
          onDelete={deleteCard}
          onAttachmentsChanged={load}
          onNotify={(message) => notify("success", message)}
        />
      ) : null}

      {entityDialog ? (
        <EntityDialog state={entityDialog} onClose={() => setEntityDialog(null)} onSave={saveEntity} />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          snapshot={snapshot}
          activeBoard={activeBoard}
          themeFamily={themeFamily}
          themeMode={themeMode}
          update={updater.state}
          onThemeFamilyChange={changeThemeFamily}
          onThemeModeChange={changeThemeMode}
          onClose={() => setSettingsOpen(false)}
          onChangeVault={async () => {
            const data = await run(api.chooseVaultFolder);
            if (data) {
              applySnapshot(data);
              notify("success", `Switched to ${data.vault_path}`);
            }
          }}
          onOpenVault={async () => void (await run(api.openVaultFolder))}
          onBackup={async () => {
            const path = await run(api.backupDatabase);
            if (path) await exported("Backup")(path);
          }}
          onRestore={async () => {
            const ok = await confirm({
              title: "Restore from a backup?",
              message: "Restoring replaces every board and task in this vault with the backup you choose. Your current data is backed up first, so you can undo this.",
              confirmLabel: "Choose backup…",
            });
            if (!ok) return;
            const result = await run(api.restoreBackupFile);
            if (result) {
              setDrawer(null);
              await run(load);
              notify("success", "Backup restored. Your previous data was saved as a backup.", result.backup_path);
            }
          }}
          onExportJson={async () => {
            const path = await run(api.exportJson);
            if (path) await exported("JSON export")(path);
          }}
          onImportJson={async () => {
            const ok = await confirm({
              title: "Import a JSON export?",
              message: "Importing replaces every board, task, and setting in this vault with the contents of the file. Your current data is backed up first, so you can undo this.",
              confirmLabel: "Choose file…",
            });
            if (!ok) return;
            const result = await run(api.importJsonFile);
            if (result) {
              setDrawer(null);
              await run(load);
              notify("success", `Imported ${result.boards} ${result.boards === 1 ? "board" : "boards"} and ${result.cards} ${result.cards === 1 ? "task" : "tasks"}. Previous data was backed up.`, result.backup_path);
            }
          }}
          onExportMarkdown={async () => {
            if (!activeBoard) return;
            const path = await run(() => api.exportBoardMarkdown(activeBoard.id));
            if (path) await exported("Markdown export")(path);
          }}
          onExportCsv={async () => {
            if (!activeBoard) return;
            const path = await run(() => api.exportBoardCsv(activeBoard.id));
            if (path) await exported("CSV export")(path);
          }}
          onToggleUpdateChecks={async (enabled) => {
            await run(async () => {
              await api.setUpdateChecks(enabled);
              mutateSnapshot((current) => ({ ...current, check_for_updates: enabled }));
            });
          }}
          onCheckForUpdates={() => void updater.checkNow(true)}
          onInstallUpdate={() => {
            setSettingsOpen(false);
            void installUpdate();
          }}
          onOpenUrl={(url) => void run(() => api.openUrl(url))}
        />
      ) : null}
      {isBrowserPreview ? <span className="sr-only">Browser preview</span> : null}
    </div>
  );
}

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
    <section className="vault-panel" aria-labelledby="vault-title">
      <div className="vault-app-mark mx-auto grid h-16 w-16 place-items-center rounded-2xl" aria-hidden="true">
        <HardDrive size={28} />
      </div>
      <p className="themed-accent mt-6 text-center text-xs font-bold uppercase tracking-[0.2em]">Welcome to Local Kanban</p>
      <h1 id="vault-title" className="mt-2 text-center text-3xl font-bold tracking-[-0.035em]">Choose where your work lives</h1>
      <p className="themed-muted mt-3 text-center text-sm leading-6">
        Pick any folder on your computer, such as one in Documents. Your boards, notes, and attachments stay there: private, portable, and easy to back up.
      </p>
      <ul className="vault-benefits" aria-label="Why a vault folder">
        <li><CheckCircle2 size={16} aria-hidden="true" /><strong>No sign-in</strong></li>
        <li><CheckCircle2 size={16} aria-hidden="true" /><strong>Works offline</strong></li>
        <li><CheckCircle2 size={16} aria-hidden="true" /><strong>Daily backups</strong></li>
      </ul>
      {error ? (
        <div className="inline-alert is-warning mt-5" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="inline-alert mt-5" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}
      <button
        type="button"
        className="primary-button mt-6 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await onChoose();
          } catch (chooseError) {
            setMessage(errorMessage(chooseError));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={17} className="spin" aria-hidden="true" /> : <FolderOpen size={17} aria-hidden="true" />}
        {busy ? "Waiting for a folder…" : "Choose a folder"}
      </button>
      <p className="themed-muted mt-4 break-all text-center text-xs">
        You can switch vaults later in Settings. App settings: {configPath}
      </p>
    </section>
  );
}

function EntityDialog({
  state,
  onClose,
  onSave,
}: {
  state: EntityDialogState;
  onClose: () => void;
  onSave: (values: { name: string; description: string; wipLimit: number | null }) => Promise<void>;
}) {
  const [name, setName] = useState(state.entity?.name ?? "");
  const [description, setDescription] = useState(state.type === "board" ? state.entity?.description ?? "" : "");
  const [wipLimit, setWipLimit] = useState(state.type === "column" && state.entity?.wip_limit ? String(state.entity.wip_limit) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const noun = state.type === "board" ? "board" : "column";

  const submit = async () => {
    if (!name.trim()) {
      setError(`Give the ${noun} a name.`);
      return;
    }
    const limit = wipLimit.trim() ? Number(wipLimit) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 9999)) {
      setError("WIP limit must be a whole number between 0 and 9999.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), description, wipLimit: limit || null });
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={`${state.entity ? "Edit" : "New"} ${noun}`} onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error ? (
          <div className="inline-alert mt-4" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        <label className="field mt-5">
          <span>Name</span>
          <input data-autofocus value={name} maxLength={200} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error && !name.trim())} />
        </label>
        {state.type === "board" ? (
          <label className="field mt-3">
            <span>Description (optional)</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        ) : (
          <label className="field mt-3">
            <span>WIP limit (optional)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="9999"
              value={wipLimit}
              onChange={(event) => setWipLimit(event.target.value)}
              placeholder="No limit"
              aria-describedby="wip-hint"
            />
            <small id="wip-hint" className="field-hint">The column is flagged when it holds more tasks than this.</small>
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="toolbar-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
            {state.entity ? "Save" : `Create ${noun}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function safeJson(value: string | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
