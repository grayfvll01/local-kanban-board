import { format, isPast, isToday, parseISO } from "date-fns";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { CSSProperties, DragEvent } from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import type { Card, Column } from "../../types";

interface KanbanBoardProps {
  columns: Column[];
  cards: Card[];
  visibleCards: Card[];
  onOpenCard: (card: Card) => void;
  onCreateCard: (columnId: string) => void;
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
  onEditColumn,
  onDeleteColumn,
  onReorderCards,
}: KanbanBoardProps) {
  const balanced = columns.length > 0 && columns.length <= 5;
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
      const nextIndex = reorderedColumnCards.findIndex((card) => card.id === item.id);
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
    const moved = { ...dragged, column_id: targetColumnId };
    const nextTargetColumnCards = [...targetColumnCards];
    nextTargetColumnCards.splice(targetIndex, 0, moved);
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
      {columns.map((column) => {
        const columnCards = cards
          .filter((card) => card.column_id === column.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const filteredCards = visibleCards.filter((card) => card.column_id === column.id);
        const showFiltered = filteredCards.length !== columnCards.length;
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            cards={showFiltered ? filteredCards : columnCards}
            allColumnCards={columnCards}
            totalCount={columnCards.length}
            columnIndex={columns.findIndex((item) => item.id === column.id)}
            columnCount={columns.length}
            onOpenCard={onOpenCard}
            onCreateCard={onCreateCard}
            onEditColumn={onEditColumn}
            onDeleteColumn={onDeleteColumn}
            onMoveCard={moveCard}
            draggedCardId={draggedCardId}
            onDragStart={(cardId) => setDraggedCardId(cardId)}
            onDragEnd={() => setDraggedCardId(null)}
            onDropCard={dropCard}
          />
        );
      })}
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
  const overLimit = Boolean(column.wip_limit && totalCount > column.wip_limit);
  const handleDrop = (event: DragEvent<HTMLElement>, targetCardId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const cardId = event.dataTransfer.getData("text/plain") || draggedCardId;
    if (!cardId) return;
    onDropCard(cardId, column.id, targetCardId);
    onDragEnd();
  };

  return (
    <section
      className="kanban-column"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => handleDrop(event)}
    >
      <div className="column-header">
        <button className="min-w-0 flex-1 text-left" onClick={() => onEditColumn(column)}>
          <div className="flex items-center gap-2">
            <h2 className="themed-title truncate text-sm font-semibold">{column.name}</h2>
            <span className={cn("count-pill", overLimit && "is-hot")}>
              {totalCount}
              {column.wip_limit ? `/${column.wip_limit}` : ""}
            </span>
          </div>
        </button>
        <button className="icon-button-subtle" onClick={() => onCreateCard(column.id)} title="New card">
          <Plus size={16} />
        </button>
        <button className="icon-button-subtle" onClick={() => onDeleteColumn(column.id)} title="Delete column">
          <Trash2 size={15} />
        </button>
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
            <Plus size={16} />
            Add a card
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
  const due = card.due_date ? parseISO(card.due_date) : null;
  const overdue = due ? isPast(due) && !isToday(due) : false;

  return (
    <article
      className={cn("kanban-card", isDragging && "is-dragging")}
      draggable
      onDoubleClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: card.color }} />
        <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <h3 className="themed-title line-clamp-2 text-sm font-semibold">{card.title}</h3>
        </button>
        <button className="icon-button-subtle" onClick={onOpen} title="Open card">
          <MoreHorizontal size={16} />
        </button>
      </div>
      {card.description ? (
        <div className="card-markdown mt-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.description}</ReactMarkdown>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 pr-24">
        <span className={cn("priority-pill", `priority-${card.priority}`)}>{card.priority}</span>
        {due ? (
          <span className={cn("date-pill", overdue && "is-overdue")}>
            {format(due, "MMM d")}
          </span>
        ) : null}
        {card.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="tag-pill">
            #{tag}
          </span>
        ))}
        {card.attachments.length ? (
          <span className="tag-pill">{card.attachments.length} files</span>
        ) : null}
      </div>
      <div className="card-move-buttons">
        {canMoveLeft ? (
          <button className="move-button" onClick={() => onMove("left")} title="Move left">
            <ArrowLeft size={13} />
          </button>
        ) : null}
        {canMoveUp ? (
          <button className="move-button" onClick={() => onMove("up")} title="Move up">
            <ArrowUp size={13} />
          </button>
        ) : null}
        {canMoveDown ? (
          <button className="move-button" onClick={() => onMove("down")} title="Move down">
            <ArrowDown size={13} />
          </button>
        ) : null}
        {canMoveRight ? (
          <button className="move-button" onClick={() => onMove("right")} title="Move right">
            <ArrowRight size={13} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function orderCardsByColumns(cards: Card[], columns: Column[]) {
  return columns.flatMap((column) =>
    cards
      .filter((card) => card.column_id === column.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((card, index) => ({ ...card, sort_order: index * 1000 })),
  );
}
