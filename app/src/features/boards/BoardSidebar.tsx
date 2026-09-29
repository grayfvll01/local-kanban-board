import {
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../../components/ConfirmDialog";
import { Menu, MenuItem } from "../../components/Menu";
import { cn } from "../../lib/cn";
import type { Board } from "../../types";

interface BoardSidebarProps {
  boards: Board[];
  cardCounts: Record<string, number>;
  selectedBoardId?: string;
  vaultPath?: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (board: Board) => void;
  onDelete: (id: string) => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
}

export function BoardSidebar({
  boards,
  cardCounts,
  selectedBoardId,
  vaultPath,
  mobileOpen,
  onCloseMobile,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onOpenVault,
  onOpenSettings,
}: BoardSidebarProps) {
  const confirm = useConfirm();
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1180px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1180px)");
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // On narrow windows the sidebar slides over the board: move focus in when it opens
  // and back to the menu button when it closes.
  useEffect(() => {
    if (!narrow) return;
    if (mobileOpen) closeRef.current?.focus();
    else if (wasOpen.current) document.querySelector<HTMLElement>(".mobile-nav-button")?.focus();
    wasOpen.current = mobileOpen;
  }, [mobileOpen, narrow]);

  const selectBoard = (id: string) => {
    onSelect(id);
    onCloseMobile();
  };

  const requestDelete = async (board: Board) => {
    const count = cardCounts[board.id] ?? 0;
    const ok = await confirm({
      title: `Delete “${board.name}”?`,
      message: `This permanently removes the board, its columns, and ${count} ${count === 1 ? "task" : "tasks"}, including attachments. This can't be undone.`,
      confirmLabel: "Delete board",
      tone: "danger",
    });
    if (ok) onDelete(board.id);
  };

  return (
    <>
      <button
        type="button"
        className={cn("sidebar-scrim", mobileOpen && "is-visible")}
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onCloseMobile}
      />
      <aside
        className={cn("sidebar", mobileOpen && "is-open")}
        aria-label="Workspace navigation"
        inert={narrow && !mobileOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape" && narrow && mobileOpen) {
            event.stopPropagation();
            onCloseMobile();
          }
        }}
      >
        <div className="sidebar-brand">
          <div className="app-mark" aria-hidden="true">
            <LayoutDashboard size={20} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold tracking-[-0.02em]">Local Kanban</p>
            <p className="themed-muted mt-0.5 text-xs">Private by design</p>
          </div>
          <button ref={closeRef} type="button" className="icon-button-subtle sidebar-close" onClick={onCloseMobile} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="privacy-callout">
          <span className="privacy-icon" aria-hidden="true"><ShieldCheck size={15} /></span>
          <span className="min-w-0">
            <strong>Stored on this device</strong>
            <span>No account or cloud sync</span>
          </span>
          <CheckCircle2 size={15} className="privacy-check" aria-hidden="true" />
        </div>

        <div className="sidebar-section-header">
          <h2>Boards</h2>
          <button type="button" className="icon-button-subtle" onClick={onCreate} aria-label="Create board" title="Create board">
            <Plus size={17} />
          </button>
        </div>

        <nav className="board-list" aria-label="Boards">
          {boards.map((board) => {
            const selected = selectedBoardId === board.id;
            const count = cardCounts[board.id] ?? 0;
            return (
              <div key={board.id} className={cn("board-nav-item", selected && "is-selected")}>
                <button
                  type="button"
                  className="board-nav-main"
                  onClick={() => selectBoard(board.id)}
                  aria-current={selected ? "page" : undefined}
                >
                  <span className="board-nav-icon" aria-hidden="true">
                    <span />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold" title={board.name}>{board.name}</span>
                    <span className="themed-muted mt-0.5 block truncate text-xs">
                      {count} {count === 1 ? "task" : "tasks"}
                    </span>
                  </span>
                </button>
                <Menu
                  label={`Actions for board ${board.name}`}
                  icon={<MoreHorizontal size={16} />}
                  buttonClassName="board-menu-trigger icon-button-subtle"
                  menuClassName="board-context-menu"
                >
                  <MenuItem icon={<Pencil size={15} />} onSelect={() => onEdit(board)}>
                    Rename board
                  </MenuItem>
                  <MenuItem icon={<Trash2 size={15} />} danger onSelect={() => void requestDelete(board)}>
                    Delete board
                  </MenuItem>
                </Menu>
              </div>
            );
          })}
          {!boards.length ? (
            <button type="button" className="sidebar-empty" onClick={onCreate}>
              <Plus size={18} aria-hidden="true" />
              <span><strong>Create your first board</strong><small>Start organizing in seconds</small></span>
            </button>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-footer-button" onClick={onOpenVault} title={vaultPath ?? undefined}>
            <FolderOpen size={17} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-left">
              <strong>Open vault folder</strong>
              <small className="truncate">{vaultPath?.split(/[\\/]/).filter(Boolean).pop() ?? "Local workspace"}</small>
            </span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          <button type="button" className="sidebar-footer-button" onClick={onOpenSettings}>
            <Settings2 size={17} aria-hidden="true" />
            <span className="flex-1 text-left"><strong>Settings</strong></span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}
