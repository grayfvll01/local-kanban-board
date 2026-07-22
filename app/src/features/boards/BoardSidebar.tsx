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
import { useState } from "react";
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const selectBoard = (id: string) => {
    onSelect(id);
    onCloseMobile();
  };

  return (
    <>
      <button
        className={cn("sidebar-scrim", mobileOpen && "is-visible")}
        aria-label="Close navigation"
        onClick={onCloseMobile}
      />
      <aside className={cn("sidebar", mobileOpen && "is-open")} aria-label="Workspace navigation">
        <div className="sidebar-brand">
          <div className="app-mark" aria-hidden="true">
            <LayoutDashboard size={20} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold tracking-[-0.02em]">Local Kanban</h1>
            <p className="themed-muted mt-0.5 text-xs">Private by design</p>
          </div>
          <button className="icon-button-subtle sidebar-close" onClick={onCloseMobile} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="privacy-callout">
          <span className="privacy-icon"><ShieldCheck size={15} /></span>
          <span className="min-w-0">
            <strong>Stored on this device</strong>
            <span>No account or cloud sync</span>
          </span>
          <CheckCircle2 size={15} className="privacy-check" />
        </div>

        <div className="sidebar-section-header">
          <span>Boards</span>
          <button className="icon-button-subtle" onClick={onCreate} aria-label="Create board" title="Create board">
            <Plus size={17} />
          </button>
        </div>

        <nav className="board-list" aria-label="Boards">
          {boards.map((board) => {
            const selected = selectedBoardId === board.id;
            const menuOpen = openMenuId === board.id;
            return (
              <div key={board.id} className={cn("board-nav-item", selected && "is-selected")}>
                <button className="board-nav-main" onClick={() => selectBoard(board.id)} aria-current={selected ? "page" : undefined}>
                  <span className="board-nav-icon" aria-hidden="true">
                    <span />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{board.name}</span>
                    <span className="themed-muted mt-0.5 block truncate text-xs">
                      {cardCounts[board.id] ?? 0} {(cardCounts[board.id] ?? 0) === 1 ? "task" : "tasks"}
                    </span>
                  </span>
                </button>
                <button
                  className="board-menu-trigger icon-button-subtle"
                  aria-label={`Actions for ${board.name}`}
                  aria-expanded={menuOpen}
                  onClick={() => setOpenMenuId(menuOpen ? null : board.id)}
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpen ? (
                  <div className="context-menu board-context-menu" role="menu">
                    <button role="menuitem" onClick={() => { setOpenMenuId(null); onEdit(board); }}>
                      <Pencil size={15} /> Edit board
                    </button>
                    <button
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        setOpenMenuId(null);
                        if (window.confirm(`Delete “${board.name}” and all of its tasks? This cannot be undone.`)) onDelete(board.id);
                      }}
                    >
                      <Trash2 size={15} /> Delete board
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!boards.length ? (
            <button className="sidebar-empty" onClick={onCreate}>
              <Plus size={18} />
              <span><strong>Create your first board</strong><small>Start organizing in seconds</small></span>
            </button>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-footer-button" onClick={onOpenVault}>
            <FolderOpen size={17} />
            <span className="min-w-0 flex-1 text-left">
              <strong>Open vault</strong>
              <small className="truncate">{vaultPath?.split(/[\\/]/).filter(Boolean).pop() ?? "Local workspace"}</small>
            </span>
            <ChevronRight size={15} />
          </button>
          <button className="sidebar-footer-button" onClick={onOpenSettings}>
            <Settings2 size={17} />
            <span className="flex-1 text-left"><strong>Settings</strong></span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}
