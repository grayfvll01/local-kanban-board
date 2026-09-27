import type { Card, CardOrderUpdate, Column, MoveDirection, Priority } from "../types";

// Pure board logic. Keep this file free of runtime imports so `npm test` can run it directly.

export interface Filters {
  tag: string;
  priority: "all" | Priority;
  due: "all" | "overdue" | "today" | "none";
  column: string;
}

export const defaultFilters: Filters = { tag: "", priority: "all", due: "all", column: "all" };

const priorities = ["all", "low", "medium", "high", "urgent"];
const dueOptions = ["all", "overdue", "today", "none"];

/** Accepts stored JSON of unknown shape and always returns valid filters. */
export function normalizeFilters(value: unknown): Filters {
  if (!value || typeof value !== "object") return { ...defaultFilters };
  const input = value as Record<string, unknown>;
  return {
    tag: typeof input.tag === "string" ? input.tag : "",
    priority: priorities.includes(input.priority as string) ? (input.priority as Filters["priority"]) : "all",
    due: dueOptions.includes(input.due as string) ? (input.due as Filters["due"]) : "all",
    column: typeof input.column === "string" && input.column ? input.column : "all",
  };
}

export function activeFilterCount(filters: Filters) {
  return [
    Boolean(filters.tag.trim()),
    filters.priority !== "all",
    filters.due !== "all",
    filters.column !== "all",
  ].filter(Boolean).length;
}

/** Today's date as YYYY-MM-DD in the user's time zone. */
export function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function filterCards(cards: Card[], search: string, filters: Filters, today = localDateKey()) {
  const query = search.trim().toLowerCase();
  const tag = filters.tag.trim().toLowerCase().replace(/^#/, "");
  return cards.filter((card) => {
    if (query) {
      const haystack = `${card.title} ${card.description} ${card.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (tag && !card.tags.some((item) => item.toLowerCase().includes(tag))) return false;
    if (filters.priority !== "all" && card.priority !== filters.priority) return false;
    if (filters.column !== "all" && card.column_id !== filters.column) return false;
    if (filters.due === "none" && card.due_date) return false;
    if (filters.due === "today" && card.due_date !== today) return false;
    if (filters.due === "overdue" && (!card.due_date || card.due_date >= today)) return false;
    return true;
  });
}

export function sortByOrder<T extends { sort_order: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order);
}

/** Returns every card on the given columns with compact, gap-free sort orders. */
export function orderCardsByColumns(cards: Card[], columns: Column[]) {
  return columns.flatMap((column) =>
    sortByOrder(cards.filter((card) => card.column_id === column.id)).map((card, index) => ({
      ...card,
      sort_order: index * 1000,
    })),
  );
}

/** Moves a card one step. Returns null when the move is not possible. */
export function moveCard(cards: Card[], columns: Column[], cardId: string, direction: MoveDirection) {
  const card = cards.find((item) => item.id === cardId);
  if (!card) return null;
  const columnIndex = columns.findIndex((column) => column.id === card.column_id);
  if (columnIndex < 0) return null;

  if (direction === "left" || direction === "right") {
    const target = columns[columnIndex + (direction === "left" ? -1 : 1)];
    if (!target) return null;
    const last = Math.max(-1000, ...cards.filter((item) => item.column_id === target.id).map((item) => item.sort_order));
    const next = cards.map((item) =>
      item.id === cardId ? { ...item, column_id: target.id, sort_order: last + 1000 } : item,
    );
    return orderCardsByColumns(next, columns);
  }

  const columnCards = sortByOrder(cards.filter((item) => item.column_id === card.column_id));
  const index = columnCards.findIndex((item) => item.id === cardId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= columnCards.length) return null;
  const reordered = moveItem(columnCards, index, targetIndex);
  const next = cards.map((item) => {
    const position = reordered.findIndex((entry) => entry.id === item.id);
    return position >= 0 ? { ...item, sort_order: position * 1000 } : item;
  });
  return orderCardsByColumns(next, columns);
}

/** Places a dragged card before `beforeCardId`, or at the end of the target column. */
export function dropCard(
  cards: Card[],
  columns: Column[],
  cardId: string,
  targetColumnId: string,
  beforeCardId?: string,
) {
  const dragged = cards.find((card) => card.id === cardId);
  if (!dragged || !columns.some((column) => column.id === targetColumnId)) return null;
  if (beforeCardId === cardId) return null;
  const others = cards.filter((card) => card.id !== cardId);
  const targetCards = sortByOrder(others.filter((card) => card.column_id === targetColumnId));
  const found = beforeCardId ? targetCards.findIndex((card) => card.id === beforeCardId) : -1;
  const insertAt = found >= 0 ? found : targetCards.length;
  targetCards.splice(insertAt, 0, { ...dragged, column_id: targetColumnId });
  const next = others
    .filter((card) => card.column_id !== targetColumnId)
    .concat(targetCards.map((card, index) => ({ ...card, sort_order: index * 1000 })));
  return orderCardsByColumns(next, columns);
}

/** Only the cards whose position actually changed need to be written. */
export function orderChanges(before: Card[], after: Card[]): CardOrderUpdate[] {
  const previous = new Map(before.map((card) => [card.id, card]));
  return after
    .filter((card) => {
      const old = previous.get(card.id);
      return !old || old.column_id !== card.column_id || old.sort_order !== card.sort_order;
    })
    .map((card) => ({ id: card.id, column_id: card.column_id, sort_order: card.sort_order }));
}

export function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function parseTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter((tag) => tag && !seen.has(tag) && seen.add(tag));
}

export function summarizeMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/[`*_>#~]/g, "")
    .replace(/(^|\s)[-+]\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
