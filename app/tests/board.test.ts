import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeFilterCount,
  dropCard,
  filterCards,
  localDateKey,
  moveCard,
  normalizeFilters,
  orderChanges,
  parseTags,
  summarizeMarkdown,
} from "../src/lib/board.ts";
import type { Card, Column } from "../src/types/index.ts";

const column = (id: string, sort_order: number): Column => ({
  id,
  board_id: "b",
  name: id,
  sort_order,
  created_at: "",
  updated_at: "",
});

const card = (id: string, column_id: string, sort_order: number, extra: Partial<Card> = {}): Card => ({
  id,
  board_id: "b",
  column_id,
  title: id,
  description: "",
  priority: "medium",
  color: "#3b82f6",
  sort_order,
  created_at: "",
  updated_at: "",
  tags: [],
  attachments: [],
  ...extra,
});

const columns = [column("todo", 0), column("doing", 1000), column("done", 2000)];
const cards = [card("a", "todo", 0), card("b", "todo", 1000), card("c", "doing", 5000)];
const ids = (list: Card[] | null, columnId: string) =>
  (list ?? []).filter((item) => item.column_id === columnId).map((item) => item.id);

test("moving right appends to the end of the next column", () => {
  const next = moveCard(cards, columns, "a", "right");
  assert.deepEqual(ids(next, "todo"), ["b"]);
  assert.deepEqual(ids(next, "doing"), ["c", "a"]);
});

test("moving up and down swaps neighbours and rejects impossible moves", () => {
  assert.deepEqual(ids(moveCard(cards, columns, "b", "up"), "todo"), ["b", "a"]);
  assert.equal(moveCard(cards, columns, "a", "up"), null);
  assert.equal(moveCard(cards, columns, "a", "left"), null);
  assert.equal(moveCard(cards, columns, "missing", "down"), null);
});

test("dropping before a card inserts it at that position", () => {
  const next = dropCard(cards, columns, "c", "todo", "b");
  assert.deepEqual(ids(next, "todo"), ["a", "c", "b"]);
  assert.deepEqual(ids(dropCard(cards, columns, "a", "done"), "done"), ["a"]);
  assert.equal(dropCard(cards, columns, "a", "nowhere"), null);
});

test("only changed positions are written", () => {
  const next = dropCard(cards, columns, "a", "done") ?? [];
  const changes = orderChanges(cards, next);
  assert.deepEqual(
    changes.map((change) => change.id).sort(),
    ["a", "b", "c"],
  );
  assert.deepEqual(orderChanges(next, next), []);
});

test("filters use the local date and tolerate bad stored values", () => {
  const today = localDateKey(new Date(2030, 0, 15));
  assert.equal(today, "2030-01-15");
  const dated = [
    card("late", "todo", 0, { due_date: "2030-01-14", tags: ["ops"] }),
    card("now", "todo", 1, { due_date: "2030-01-15", priority: "urgent" }),
    card("none", "todo", 2, { description: "Find me" }),
  ];
  const filters = normalizeFilters({ due: "overdue", priority: "nope" });
  assert.deepEqual(filterCards(dated, "", filters, today).map((item) => item.id), ["late"]);
  assert.deepEqual(filterCards(dated, "", { ...filters, due: "today" }, today).map((item) => item.id), ["now"]);
  assert.deepEqual(filterCards(dated, "find", normalizeFilters(null), today).map((item) => item.id), ["none"]);
  assert.deepEqual(filterCards(dated, "", { ...normalizeFilters(null), tag: "#OPS" }, today).map((item) => item.id), ["late"]);
  assert.equal(activeFilterCount(filters), 1);
});

test("tags and summaries are cleaned for display", () => {
  assert.deepEqual(parseTags("Design, #design, , release "), ["design", "release"]);
  assert.equal(summarizeMarkdown("- [x] Done **well**\n![img](attachment:1) [link](https://x.y)"), "Done well link");
});
