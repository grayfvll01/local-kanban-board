import { LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Board } from "../../types";

interface BoardSidebarProps {
  boards: Board[];
  selectedBoardId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (board: Board) => void;
  onDelete: (id: string) => void;
}

export function BoardSidebar({
  boards,
  selectedBoardId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: BoardSidebarProps) {
  return (
    <aside className="sidebar flex h-full w-72 shrink-0 flex-col border-r">
      <div className="sidebar-header border-b px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="themed-icon-tile grid h-10 w-10 place-items-center rounded-xl">
            <LayoutGrid size={22} />
          </div>
          <div>
            <h1 className="themed-title text-lg font-semibold tracking-normal">local-kanban-board</h1>
            <p className="themed-muted text-xs">Local vault workspace</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        <span className="themed-label text-xs font-semibold uppercase">
          Boards
        </span>
        <button className="icon-button" onClick={onCreate} title="New board">
          <Plus size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {boards.map((board) => (
          <div
            key={board.id}
            className={cn(
              "board-list-item group flex items-center gap-2 rounded-lg px-2 py-2 transition",
              selectedBoardId === board.id && "is-selected",
            )}
          >
            <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(board.id)}>
              <div className="truncate text-sm font-medium">{board.name}</div>
              {board.description ? (
                <div className="themed-muted truncate text-xs">{board.description}</div>
              ) : null}
            </button>
            <button
              className="icon-button-subtle opacity-0 group-hover:opacity-100"
              onClick={() => onEdit(board)}
              title="Edit board"
            >
              <Pencil size={14} />
            </button>
            <button
              className="icon-button-subtle opacity-0 group-hover:opacity-100"
              onClick={() => onDelete(board.id)}
              title="Delete board"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
