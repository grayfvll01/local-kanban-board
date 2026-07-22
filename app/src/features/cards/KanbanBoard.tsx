import { format, isPast, isToday, parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Flag,
  GripVertical,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import type { Card, Column } from "../../types";

interface KanbanBoardProps {
  columns: Column[];
  cards: Card[];
  visibleCards: Card[];
  onOpenCard: (card: Card) => void;
  onCreateCard: (columnId: string) => void;
  onCreateColumn: () => void;
  onEditColumn: (column: Column) => void;
  onDeleteColumn: (id: string) => void;
  onReorderCards: (cards: Card[]) => void;
}

export function KanbanBoard({
  columns,
  cards,
  visibleCards,
  onOpenCard,
  onCreateCard,
  onCreateColumn,
  onEditColumn,
  onDeleteColumn,
  onReorderCards,
}: KanbanBoardProps) {
  const balanced = columns.length > 0 && columns.length <= 4;
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

  const moveCard = (card: Card, direction: "left" | "right" | "up" | "down") => {
    const currentColumnIndex = columns.findIndex((column) => column.id === card.column_id);
    if (currentColumnIndex < 0) return;

    if (direction === "left" || direction === "right") {
      const targetColumn = columns[currentColumnIndex + (direction === "left" ? -1 : 1)];
      if (!targetColumn) return;
      const targetColumnCards = cards.filter((item) => item.column_id === targetColumn.id);
      const nextCards = cards.map((item) =>
        item.id === card.id
          ? { ...item, column_id: targetColumn.id, sort_order: targetColumnCards.length * 1000 }
          : item,
      );
      onReorderCards(orderCardsByColumns(nextCards, columns));
      return;
    }

    const columnCards = cards
      .filter((item) => item.column_id === card.column_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = columnCards.findIndex((item) => item.id === card.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= columnCards.length) return;

    const reorderedColumnCards = [...columnCards];
    const [moved] = reorderedColumnCards.splice(index, 1);
    reorderedColumnCards.splice(targetIndex, 0, moved);
    const nextCards = cards.map((item) => {
      const nextIndex = reorderedColumnCards.findIndex((nextCard) => nextCard.id === item.id);
      return nextIndex >= 0 ? { ...item, sort_order: nextIndex * 1000 } : item;
    });
    onReorderCards(orderCardsByColumns(nextCards, columns));
  };

  const dropCard = (cardId: string, targetColumnId: string, targetCardId?: string) => {
    const dragged = cards.find((card) => card.id === cardId);
    if (!dragged) return;

    const cardsWithoutDragged = cards.filter((card) => card.id !== cardId);
    const targetColumnCards = cardsWithoutDragged
      .filter((card) => card.column_id === targetColumnId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const foundTargetIndex = targetCardId
      ? targetColumnCards.findIndex((card) => card.id === targetCardId)
      : -1;
    const targetIndex = foundTargetIndex >= 0 ? foundTargetIndex : targetColumnCards.length;
    const nextTargetColumnCards = [...targetColumnCards];
    nextTargetColumnCards.splice(targetIndex, 0, { ...dragged, column_id: targetColumnId });
    const nextCards = cardsWithoutDragged
      .filter((card) => card.column_id !== targetColumnId)
      .concat(nextTargetColumnCards);
    onReorderCards(orderCardsByColumns(nextCards, columns));
  };

  return (
    <div
      className={cn("kanban-scroll", balanced && "is-balanced")}
      style={{ "--column-count": columns.length } as CSSProperties}
    >
      {columns.map((column, columnIndex) => {
        const columnCards = cards
          .filter((card) => card.column_id === column.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const filteredCards = visibleCards.filter((card) => card.column_id === column.id);
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            cards={filteredCards.length === columnCards.length ? columnCards : filteredCards}
            allColumnCards={columnCards}
            totalCount={columnCards.length}
            columnIndex={columnIndex}
            columnCount={columns.length}
            onOpenCard={onOpenCard}
            onCreateCard={onCreateCard}
            onEditColumn={onEditColumn}
            onDeleteColumn={onDeleteColumn}
            onMoveCard={moveCard}
            draggedCardId={draggedCardId}
            onDragStart={setDraggedCardId}
            onDragEnd={() => setDraggedCardId(null)}
            onDropCard={dropCard}
          />
        );
      })}
      <button className="add-column-card" onClick={onCreateColumn}>
        <span><Plus size={19} /></span>
        Add another column
      </button>
    </div>
  );
}

function KanbanColumn({
  column,
  cards,
  allColumnCards,
  totalCount,
  columnIndex,
  columnCount,
  onOpenCard,
  onCreateCard,
  onEditColumn,
  onDeleteColumn,
  onMoveCard,
  draggedCardId,
  onDragStart,
  onDragEnd,
  onDropCard,
}: {
  column: Column;
  cards: Card[];
  allColumnCards: Card[];
  totalCount: number;
  columnIndex: number;
  columnCount: number;
  onOpenCard: (card: Card) => void;
  onCreateCard: (columnId: string) => void;
  onEditColumn: (column: Column) => void;
  onDeleteColumn: (id: string) => void;
  onMoveCard: (card: Card, direction: "left" | "right" | "up" | "down") => void;
  draggedCardId: string | null;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onDropCard: (cardId: string, targetColumnId: string, targetCardId?: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const overLimit = Boolean(column.wip_limit && totalCount > column.wip_limit);
  const handleDrop = (event: DragEvent<HTMLElement>, targetCardId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const cardId = event.dataTransfer.getData("text/plain") || draggedCardId;
    if (!cardId) return;
    onDropCard(cardId, column.id, targetCardId);
    onDragEnd();
  };

  return (
    <section
      className={cn("kanban-column", dragOver && "is-drag-over")}
      aria-label={`${column.name}, ${totalCount} ${totalCount === 1 ? "task" : "tasks"}`}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => handleDrop(event)}
    >
      <div className="column-header">
        <span className={`column-dot column-dot-${columnIndex % 5}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[13px] font-bold">{column.name}</h2>
            <span className={cn("count-pill", overLimit && "is-hot")}>{totalCount}</span>
          </div>
          {column.wip_limit ? (
            <p className={cn("column-limit", overLimit && "is-hot")}>
              {overLimit
                ? "Limit exceeded"
                : `${column.wip_limit - totalCount} ${column.wip_limit - totalCount === 1 ? "slot" : "slots"} available`}
            </p>
          ) : null}
        </div>
        <button className="column-add-button" onClick={() => onCreateCard(column.id)} aria-label={`Add task to ${column.name}`}>
          <Plus size={17} />
        </button>
        <div className="context-menu-wrap">
          <button className="icon-button-subtle" onClick={() => setMenuOpen(!menuOpen)} aria-label={`Actions for ${column.name}`} aria-expanded={menuOpen}>
            <MoreHorizontal size={17} />
          </button>
          {menuOpen ? (
            <div className="context-menu column-context-menu" role="menu">
              <button role="menuitem" onClick={() => { setMenuOpen(false); onEditColumn(column); }}>
                <Pencil size={15} /> Edit column
              </button>
              <button
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  if (window.confirm(`Delete “${column.name}” and its ${totalCount} tasks? This cannot be undone.`)) onDeleteColumn(column.id);
                }}
              >
                <Trash2 size={15} /> Delete column
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="column-card-list">
        {cards.map((card) => {
          const cardIndex = allColumnCards.findIndex((item) => item.id === card.id);
          return (
            <KanbanCard
              key={card.id}
              card={card}
              canMoveLeft={columnIndex > 0}
              canMoveRight={columnIndex < columnCount - 1}
              canMoveUp={cardIndex > 0}
              canMoveDown={cardIndex >= 0 && cardIndex < allColumnCards.length - 1}
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
          <button className="empty-column" onClick={() => onCreateCard(column.id)}>
            <span><Plus size={17} /></span>
            <strong>Add a task</strong>
            <small>Drop tasks here or create one</small>
          </button>
        ) : null}
        {cards.length ? (
          <button className="quick-add-card" onClick={() => onCreateCard(column.id)}>
            <Plus size={16} /> Add task
          </button>
        ) : null}
      </div>
    </section>
  );
}

function KanbanCard({
  card,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  onOpen,
  onMove,
  isDragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  card: Card;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onMove: (direction: "left" | "right" | "up" | "down") => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const due = card.due_date ? parseISO(card.due_date) : null;
  const overdue = due ? isPast(due) && !isToday(due) : false;
  const summary = summarizeMarkdown(card.description);

  const stop = (event: MouseEvent) => event.stopPropagation();
  return (
    <article
      className={cn("kanban-card", isDragging && "is-dragging")}
      style={{ "--card-accent": card.color } as CSSProperties}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="card-accent" aria-hidden="true" />
      <button className="card-open-hitarea" onClick={onOpen} aria-label={`Open task: ${card.title}`} />
      <div className="flex items-start gap-2.5">
        <GripVertical className="card-grip" size={16} aria-hidden="true" />
        <h3 className="min-w-0 flex-1 text-sm font-bold leading-5">{card.title}</h3>
        <div className="context-menu-wrap" onClick={stop}>
          <button className="card-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={`Move ${card.title}`} aria-expanded={menuOpen}>
            <MoreHorizontal size={17} />
          </button>
          {menuOpen ? (
            <div className="context-menu card-context-menu" role="menu">
              <span className="context-menu-label">Move task</span>
              {canMoveLeft ? <MoveAction icon={<ArrowLeft size={15} />} label="Previous column" onClick={() => onMove("left")} /> : null}
              {canMoveRight ? <MoveAction icon={<ArrowRight size={15} />} label="Next column" onClick={() => onMove("right")} /> : null}
              {canMoveUp ? <MoveAction icon={<ArrowUp size={15} />} label="Move up" onClick={() => onMove("up")} /> : null}
              {canMoveDown ? <MoveAction icon={<ArrowDown size={15} />} label="Move down" onClick={() => onMove("down")} /> : null}
              {!canMoveLeft && !canMoveRight && !canMoveUp && !canMoveDown ? <span className="context-menu-empty">No moves available</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {summary ? <p className="card-summary">{summary}</p> : null}

      <div className="card-meta">
        <span className={cn("priority-pill", `priority-${card.priority}`)} title={`${card.priority} priority`}>
          <Flag size={12} fill="currentColor" /> {card.priority}
        </span>
        {due ? (
          <span className={cn("date-pill", overdue && "is-overdue")} title={overdue ? "Overdue" : "Due date"}>
            <CalendarDays size={12} /> {isToday(due) ? "Today" : format(due, "MMM d")}
          </span>
        ) : null}
        {card.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="tag-pill"><Tag size={11} />{tag}</span>
        ))}
        {card.tags.length > 2 ? <span className="tag-pill">+{card.tags.length - 2}</span> : null}
        {card.attachments.length ? (
          <span className="tag-pill" title={`${card.attachments.length} attachments`}>
            <Paperclip size={11} /> {card.attachments.length}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function MoveAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button role="menuitem" onClick={onClick}>{icon}{label}</button>;
}

function summarizeMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~]/g, "")
    .replace(/(^|\s)-\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

function orderCardsByColumns(cards: Card[], columns: Column[]) {
  return columns.flatMap((column) =>
    cards
      .filter((card) => card.column_id === column.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((card, index) => ({ ...card, sort_order: index * 1000 })),
  );
}
