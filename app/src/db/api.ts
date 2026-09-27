import { invoke } from "@tauri-apps/api/core";
import type {
  Attachment,
  Board,
  Card,
  CardInput,
  CardOrderUpdate,
  Column,
  ImportSummary,
  RestoreSummary,
  Snapshot,
} from "../types";

/** `?preview` in `npm run dev:vite` renders sample data without the native app. */
export const isBrowserPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong. Please try again.";
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isBrowserPreview) {
    throw new Error("This action needs the desktop app.");
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

const previewOnly = <T>(value: T) => (isBrowserPreview ? Promise.resolve(value) : null);

export const api = {
  loadSnapshot: () => previewOnly(previewSnapshot()) ?? call<Snapshot>("load_snapshot"),
  chooseVaultFolder: () => call<Snapshot | null>("choose_vault_folder"),
  openVaultFolder: () => previewOnly(undefined) ?? call<void>("open_vault_folder"),
  setUpdateChecks: (enabled: boolean) =>
    previewOnly(undefined) ?? call<void>("set_update_checks", { enabled }),
  createBoard: (name: string, description = "") =>
    call<Board>("create_board", { name, description }),
  updateBoard: (board: Pick<Board, "id" | "name" | "description">) =>
    call<Board>("update_board", { id: board.id, name: board.name, description: board.description }),
  deleteBoard: (id: string) => call<void>("delete_board", { id }),
  createColumn: (boardId: string, name: string) =>
    call<Column>("create_column", { boardId, name }),
  updateColumn: (column: Pick<Column, "id" | "name" | "wip_limit">) =>
    call<Column>("update_column", {
      id: column.id,
      name: column.name,
      wipLimit: column.wip_limit ?? null,
    }),
  deleteColumn: (id: string) => call<void>("delete_column", { id }),
  reorderColumns: (boardId: string, orderedIds: string[]) =>
    previewOnly(undefined) ?? call<void>("reorder_columns", { boardId, orderedIds }),
  upsertCard: (card: CardInput) => call<Card>("upsert_card", { card }),
  deleteCard: (id: string) => call<void>("delete_card", { id }),
  reorderCards: (updates: CardOrderUpdate[]) =>
    previewOnly(undefined) ?? call<void>("reorder_cards", { updates }),
  saveSetting: (key: string, value: string) =>
    previewOnly(undefined) ?? call<void>("save_setting", { keyName: key, value }),
  addAttachment: (cardId: string, fileName: string, mimeType: string, dataBase64: string) =>
    call<Attachment>("add_attachment", { cardId, fileName, mimeType, dataBase64 }),
  attachFiles: (cardId: string) => call<Attachment[]>("attach_files", { cardId }),
  deleteAttachment: (id: string) => call<void>("delete_attachment", { id }),
  openAttachment: (id: string) => call<"opened" | "revealed">("open_attachment", { id }),
  revealPath: (path: string) => call<void>("reveal_path", { path }),
  openUrl: (url: string) => call<void>("open_url", { url }),
  exportJson: () => call<string>("export_json"),
  importJsonFile: () => call<ImportSummary | null>("import_json_file"),
  exportBoardMarkdown: (boardId: string) => call<string>("export_board_markdown", { boardId }),
  exportBoardCsv: (boardId: string) => call<string>("export_board_csv", { boardId }),
  backupDatabase: () => call<string>("backup_database"),
  restoreBackupFile: () => call<RestoreSummary | null>("restore_backup_file"),
};

function previewSnapshot(): Snapshot {
  const now = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const dueDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
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
      card("c4", "progress", "Finalize Windows build", "Verify the installer on a clean Windows profile.", "urgent", 0, ["windows", "release"], dueDate),
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
    app_version: "1.0.0",
    check_for_updates: true,
  };
}
