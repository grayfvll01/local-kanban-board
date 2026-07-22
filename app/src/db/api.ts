import { invoke } from "@tauri-apps/api/core";
import type { Board, Card, CardInput, Column, Snapshot } from "../types";

const browserPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

export const api = {
  loadSnapshot: () => browserPreview ? Promise.resolve(previewSnapshot()) : invoke<Snapshot>("load_snapshot"),
  chooseVaultFolder: () => invoke<Snapshot>("choose_vault_folder"),
  setVaultPath: (path: string) => invoke<Snapshot>("set_vault_path", { path }),
  openVaultFolder: () => browserPreview ? Promise.resolve() : invoke<void>("open_vault_folder"),
  createBoard: (name: string, description = "") =>
    invoke<Board>("create_board", { name, description }),
  updateBoard: (board: Pick<Board, "id" | "name" | "description">) =>
    invoke<Board>("update_board", board),
  deleteBoard: (id: string) => invoke<void>("delete_board", { id }),
  createColumn: (boardId: string, name: string) =>
    invoke<Column>("create_column", { boardId, name }),
  updateColumn: (column: Pick<Column, "id" | "name" | "wip_limit">) =>
    invoke<Column>("update_column", column),
  deleteColumn: (id: string) => invoke<void>("delete_column", { id }),
  reorderColumns: (boardId: string, orderedIds: string[]) =>
    invoke<void>("reorder_columns", { boardId, orderedIds }),
  upsertCard: (card: CardInput) => invoke<Card>("upsert_card", { card }),
  deleteCard: (id: string) => invoke<void>("delete_card", { id }),
  reorderCards: (
    updates: Array<{ id: string; column_id: string; sort_order: number }>,
  ) => browserPreview ? Promise.resolve() : invoke<void>("reorder_cards", { updates }),
  saveSetting: (key: string, value: string) =>
    browserPreview ? Promise.resolve() : invoke<void>("save_setting", { keyName: key, value }),
  addAttachment: (
    cardId: string,
    fileName: string,
    mimeType: string,
    dataBase64: string,
  ) =>
    invoke("add_attachment", {
      cardId,
      fileName,
      mimeType,
      dataBase64,
    }),
  deleteAttachment: (id: string) => invoke<void>("delete_attachment", { id }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  exportJson: () => invoke<string>("export_json"),
  importJson: (json: string) => invoke<void>("import_json", { json }),
  exportBoardMarkdown: (boardId: string) =>
    invoke<string>("export_board_markdown", { boardId }),
  exportBoardCsv: (boardId: string) =>
    invoke<string>("export_board_csv", { boardId }),
  backupDatabase: () => invoke<string>("backup_database"),
  restoreDatabase: (dataBase64: string) =>
    invoke<void>("restore_database", { dataBase64 }),
};

function previewSnapshot(): Snapshot {
  const now = new Date().toISOString();
  const board = (id: string, name: string, description: string, sort_order: number): Board => ({
    id, name, description, sort_order, created_at: now, updated_at: now,
  });
  const column = (id: string, name: string, sort_order: number, wip_limit?: number): Column => ({
    id, board_id: "launch", name, sort_order, wip_limit, created_at: now, updated_at: now,
  });
  const card = (
    id: string,
    column_id: string,
    title: string,
    description: string,
    priority: Card["priority"],
    sort_order: number,
    tags: string[],
    due_date?: string,
  ): Card => ({
    id,
    board_id: "launch",
    column_id,
    title,
    description,
    priority,
    due_date,
    color: priority === "urgent" ? "#ee6b7b" : priority === "high" ? "#e9a84c" : "#887cf2",
    sort_order,
    tags,
    attachments: [],
    created_at: now,
    updated_at: now,
  });

  return {
    boards: [
      board("launch", "Product launch", "Everything needed for a smooth release", 0),
      board("personal", "Personal", "Home and weekly planning", 1000),
      board("ideas", "Ideas", "Things worth exploring", 2000),
    ],
    columns: [
      column("backlog", "Backlog", 0),
      column("progress", "In progress", 1000, 3),
      column("review", "Review", 2000, 2),
      column("done", "Done", 3000),
    ],
    cards: [
      card("c1", "backlog", "Polish onboarding flow", "Make the first-run experience clear and reassuring.", "high", 0, ["ux", "launch"]),
      card("c2", "backlog", "Prepare release checklist", "Document the final QA and publishing steps.", "medium", 1000, ["release"]),
      card("c3", "backlog", "Review empty states", "Add useful guidance wherever content has not been created yet.", "low", 2000, ["copy"]),
      card("c4", "progress", "Finalize Windows build", "Verify the installer on a clean Windows profile.", "urgent", 0, ["windows", "release"], new Date(Date.now() + 86400000).toISOString().slice(0, 10)),
      card("c5", "progress", "Accessibility pass", "Check focus order, target sizes, and keyboard-only movement.", "high", 1000, ["a11y"]),
      card("c6", "review", "Proofread download page", "Keep the repository page focused on a single download action.", "medium", 0, ["copy", "release"]),
      card("c7", "done", "Choose visual direction", "A calm, dense workspace with a warm violet accent.", "medium", 0, ["design"]),
      card("c8", "done", "Automate version checks", "Keep Node, Tauri, and Rust versions synchronized.", "low", 1000, ["ci"]),
    ],
    settings: { selected_board_id: "launch", theme_family: "default", theme_mode: "dark" },
    app_data_dir: "C:\\Users\\you\\AppData\\Roaming\\Local Kanban",
    database_path: "C:\\Users\\you\\Documents\\Kanban Vault\\kanban.sqlite",
    vault_path: "C:\\Users\\you\\Documents\\Kanban Vault",
    vault_required: false,
    config_path: "C:\\Users\\you\\AppData\\Roaming\\Local Kanban\\config.json",
  };
}
