import { invoke } from "@tauri-apps/api/core";
import type { Board, Card, CardInput, Column, Snapshot } from "../types";

export const api = {
  loadSnapshot: () => invoke<Snapshot>("load_snapshot"),
  chooseVaultFolder: () => invoke<Snapshot>("choose_vault_folder"),
  setVaultPath: (path: string) => invoke<Snapshot>("set_vault_path", { path }),
  openVaultFolder: () => invoke<void>("open_vault_folder"),
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
  ) => invoke<void>("reorder_cards", { updates }),
  saveSetting: (key: string, value: string) =>
    invoke<void>("save_setting", { keyName: key, value }),
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
