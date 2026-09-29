import { format, isPast, isToday, parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  GripVertical,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useConfirm } from "../../components/ConfirmDialog";
import { Menu, MenuItem, MenuLabel } from "../../components/Menu";
import { dropCard, moveCard, sortByOrder, summarizeMarkdown } from "../../lib/board";
import { cn } from "../../lib/cn";
import type { Card, Column, MoveDirection } from "../../types";

interface KanbanBoardProps {
  columns: Column[];
  cards: Card[];
  visibleCards: Card[];
  onOpenCard: (card: Card) => void;
  onCreateCard: (columnId: string) => void;
  onCreateColumn: () => void;
  onEditColumn: (column: Column) => void;
  onDeleteColumn: (id: string) => void;
  onMoveColumn: (id: string, direction: "left" | "right") => void;
  onReorderCards: (cards: Card[], announcement: string) => void;
}

const directionLabels: Record<MoveDirection, string> = {
  left: "previous column",
  right: "next column",
  up: "up",
  down: "down",
};

export function KanbanBoard({
  columns,
  cards,
  visibleCards,
  onOpenCard,
  onCreateCard,
  onCreateColumn,
  onEditColumn,
  onDeleteColumn,
  onMoveColumn,
  onReorderCards,
}: KanbanBoardProps) {
  const balanced = columns.length > 0 && columns.length <= 4;
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const confirm = useConfirm();

  // Keyboard and menu moves re-render the card elsewhere; keep focus on it so the
  // non-drag alternative can be repeated.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"] .card-open-hitarea`)?.focus();
  }, [cards]);

  const handleMove = (card: Card, direction: MoveDirection) => {
    const next = moveCard(cards, columns, card.id, direction);
    if (!next) return;
    pendingFocus.current = card.id;
    const column = columns.find((item) => item.id === next.find((entry) => entry.id === card.id)?.column_id);
    onReorderCards(next, `Moved “${card.title}” ${directionLabels[direction]}${column ? ` in ${column.name}` : ""}.`);
  };

  const handleDrop = (cardId: string, targetColumnId: string, beforeCardId?: string) => {
    const next = dropCard(cards, columns, cardId, targetColumnId, beforeCardId);
    const card = cards.find((item) => item.id === cardId);
    const column = columns.find((item) => item.id === targetColumnId);
    if (next && card) onReorderCards(next, `Moved “${card.title}” to ${column?.name ?? "column"}.`);
  };

  const requestDeleteColumn = async (column: Column, count: number) => {
    const ok = await confirm({
      title: `Delete “${column.name}”?`,
      message:
        count > 0
          ? `This permanently removes the column and its ${count} ${count === 1 ? "task" : "tasks"}, including attachments. This can't be undone.`
          : "This permanently removes the empty column. This can't be undone.",
      confirmLabel: "Delete column",
      tone: "danger",
    });
    if (ok) onDeleteColumn(column.id);
  };

  return (
    <div
      className={cn("kanban-scroll", balanced && "is-balanced")}
      style={{ "--column-count": columns.length } as CSSProperties}
    >
      {columns.map((column, columnIndex) => {
        const columnCards = sortByOrder(cards.filter((card) => card.column_id === column.id));
        const filteredCards = visibleCards.filter((card) => card.column_id === column.id);
        const shownCards = filteredCards.length === columnCards.length ? columnCards : sortByOrder(filteredCards);
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            cards={shownCards}
            allColumnCards={columnCards}
            isFiltered={shownCards.length !== columnCards.length}
            columnIndex={columnIndex}
            columnCount={columns.length}
            onOpenCard={onOpenCard}
            onCreateCard={onCreateCard}
            onEditColumn={onEditColumn}
            onDeleteColumn={() => void requestDeleteColumn(column, columnCards.length)}
            onMoveColumn={(direction) => onMoveColumn(column.id, direction)}
            onMoveCard={handleMove}
            draggedCardId={draggedCardId}
            onDragStart={setDraggedCardId}
            onDragEnd={() => setDraggedCardId(null)}
            onDropCard={handleDrop}
          />
        );
      })}
      <button type="button" className="add-column-card" onClick={onCreateColumn}>
        <span aria-hidden="true"><Plus size={19} /></span>
        Add column
      </button>
    </div>
  );
}

function KanbanColumn({
  column,
  cards,
  allColumnCards,
  isFiltered,
  columnIndex,
  columnCount,
  onOpenCard,
  onCreateCard,
  onEditColumn,
  onDeleteColumn,
  onMoveColumn,
  onMoveCard,
  draggedCardId,
  onDragStart,
  onDragEnd,
  onDropCard,
}: {
  column: Column;
  cards: Card[];
  allColumnCards: Card[];
  isFiltered: boolean;
  columnIndex: number;
  columnCount: number;
  onOpenCard: (card: Card) => void;
  onCreateCard: (columnId: string) => void;
  onEditColumn: (column: Column) => void;
  onDeleteColumn: () => void;
  onMoveColumn: (direction: "left" | "right") => void;
  onMoveCard: (card: Card, direction: MoveDirection) => void;
  draggedCardId: string | null;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onDropCard: (cardId: string, targetColumnId: string, beforeCardId?: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const totalCount = allColumnCards.length;
  const overLimit = Boolean(column.wip_limit && totalCount > column.wip_limit);

  const acceptsDrop = (event: DragEvent) => event.dataTransfer.types.includes("application/x-kanban-card");

  const handleDrop = (event: DragEvent<HTMLElement>, beforeCardId?: string) => {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const cardId = event.dataTransfer.getData("application/x-kanban-card") || draggedCardId;
    onDragEnd();
    if (cardId) onDropCard(cardId, column.id, beforeCardId);
  };

  return (
    <section
      className={cn("kanban-column", dragOver && "is-drag-over")}
      aria-label={`${column.name}, ${totalCount} ${totalCount === 1 ? "task" : "tasks"}`}
      onDragEnter={(event) => {
        if (acceptsDrop(event)) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDragOver={(event) => {
        if (!acceptsDrop(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => handleDrop(event)}
    >
      <div className="column-header">
        <span className={`column-dot column-dot-${columnIndex % 5}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[13px] font-bold" title={column.name}>{column.name}</h2>
            <span className={cn("count-pill", overLimit && "is-hot")}>
              {isFiltered ? `${cards.length}/${totalCount}` : totalCount}
            </span>
          </div>
          {column.wip_limit ? (
            <p className={cn("column-limit", overLimit && "is-hot")}>
              {overLimit
                ? `Over limit (${totalCount}/${column.wip_limit})`
                : `${column.wip_limit - totalCount} of ${column.wip_limit} ${column.wip_limit - totalCount === 1 ? "slot" : "slots"} free`}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="column-add-button"
          onClick={() => onCreateCard(column.id)}
          aria-label={`Add task to ${column.name}`}
          title={`Add task to ${column.name}`}
        >
          <Plus size={17} />
        </button>
        <Menu
          label={`Actions for column ${column.name}`}
          icon={<MoreHorizontal size={17} />}
          buttonClassName="icon-button-subtle"
          menuClassName="column-context-menu"
        >
          <MenuItem icon={<Pencil size={15} />} onSelect={() => onEditColumn(column)}>
            Rename or set limit
          </MenuItem>
          {columnIndex > 0 ? (
            <MenuItem icon={<ChevronsLeft size={15} />} onSelect={() => onMoveColumn("left")}>
              Move column left
            </MenuItem>
          ) : null}
          {columnIndex < columnCount - 1 ? (
            <MenuItem icon={<ChevronsRight size={15} />} onSelect={() => onMoveColumn("right")}>
              Move column right
            </MenuItem>
          ) : null}
          <MenuItem icon={<Trash2 size={15} />} danger onSelect={onDeleteColumn}>
            Delete column
          </MenuItem>
        </Menu>
      </div>

      <div className="column-card-list">
        {cards.map((card) => {
          const cardIndex = allColumnCards.findIndex((item) => item.id === card.id);
          return (
            <KanbanCard
              key={card.id}
              card={card}
              canMove={{
                left: columnIndex > 0,
                right: columnIndex < columnCount - 1,
                up: cardIndex > 0,
                down: cardIndex >= 0 && cardIndex < allColumnCards.length - 1,
              }}
              onOpen={() => onOpenCard(card)}
              onMove={(direction) => onMoveCard(card, direction)}
              isDragging={draggedCardId === card.id}
              onDragStart={() => onDragStart(card.id)}
              onDragEnd={onDragEnd}
              onDrop={(event) => handleDrop(event, card.id)}
            />
          );
        })}
        {!cards.length ? (
          isFiltered ? (
            <p className="empty-column is-filtered">No matching tasks</p>
          ) : (
            <button type="button" className="empty-column" onClick={() => onCreateCard(column.id)}>
              <span aria-hidden="true"><Plus size={17} /></span>
              <strong>Add a task</strong>
              <small>Or drag one here</small>
            </button>
          )
        ) : (
          <button type="button" className="quick-add-card" onClick={() => onCreateCard(column.id)}>
            <Plus size={16} aria-hidden="true" /> Add task
          </button>
        )}
      </div>
    </section>
  );
}

const moveKeys: Record<string, MoveDirection> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

function KanbanCard({
  card,
  canMove,
  onOpen,
  onMove,
  isDragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  card: Card;
  canMove: Record<MoveDirection, boolean>;
  onOpen: () => void;
  onMove: (direction: MoveDirection) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const due = card.due_date ? parseISO(card.due_date) : null;
  const validDue = due && !Number.isNaN(due.getTime()) ? due : null;
  const overdue = validDue ? isPast(validDue) && !isToday(validDue) : false;
  const summary = summarizeMarkdown(card.description);
  const anyMove = Object.values(canMove).some(Boolean);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = moveKeys[event.key];
    if (!event.altKey || !direction) return;
    event.preventDefault();
    if (canMove[direction]) onMove(direction);
  };

  return (
    <article
      className={cn("kanban-card", isDragging && "is-dragging")}
      style={{ "--card-accent": card.color } as CSSProperties}
      data-card-id={card.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-kanban-card", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-kanban-card")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="card-accent" aria-hidden="true" />
      <button
        type="button"
        className="card-open-hitarea"
        onClick={onOpen}
        onKeyDown={onKeyDown}
        aria-label={`Open task: ${card.title}`}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
      />
      <div className="flex items-start gap-2.5">
        <GripVertical className="card-grip" size={16} aria-hidden="true" />
        <h3 className="card-title min-w-0 flex-1 text-sm font-bold leading-5">{card.title}</h3>
        <Menu
          label={`Move ${card.title}`}
          icon={<MoreHorizontal size={17} />}
          buttonClassName="card-menu-button"
          menuClassName="card-context-menu"
        >
          <MenuLabel>Move task</MenuLabel>
          {canMove.left ? <MenuItem icon={<ArrowLeft size={15} />} shortcut="Alt+←" onSelect={() => onMove("left")}>Previous column</MenuItem> : null}
          {canMove.right ? <MenuItem icon={<ArrowRight size={15} />} shortcut="Alt+→" onSelect={() => onMove("right")}>Next column</MenuItem> : null}
          {canMove.up ? <MenuItem icon={<ArrowUp size={15} />} shortcut="Alt+↑" onSelect={() => onMove("up")}>Move up</MenuItem> : null}
          {canMove.down ? <MenuItem icon={<ArrowDown size={15} />} shortcut="Alt+↓" onSelect={() => onMove("down")}>Move down</MenuItem> : null}
          {!anyMove ? <span className="context-menu-empty">No moves available</span> : null}
        </Menu>
      </div>

      {summary ? <p className="card-summary">{summary}</p> : null}

      <div className="card-meta">
        <span className={cn("priority-pill", `priority-${card.priority}`)}>
          <Flag size={12} fill="currentColor" aria-hidden="true" /> {card.priority}
        </span>
        {validDue ? (
          <span className={cn("date-pill", overdue && "is-overdue")}>
            <CalendarDays size={12} aria-hidden="true" />
            {overdue ? "Overdue · " : ""}
            {isToday(validDue) ? "Today" : format(validDue, "MMM d")}
          </span>
        ) : null}
        {card.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="tag-pill"><Tag size={11} aria-hidden="true" />{tag}</span>
        ))}
        {card.tags.length > 2 ? <span className="tag-pill" title={card.tags.slice(2).join(", ")}>+{card.tags.length - 2}</span> : null}
        {card.attachments.length ? (
          <span className="tag-pill" title={`${card.attachments.length} ${card.attachments.length === 1 ? "attachment" : "attachments"}`}>
            <Paperclip size={11} aria-hidden="true" /> {card.attachments.length}
            <span className="sr-only">{card.attachments.length === 1 ? "attachment" : "attachments"}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}
