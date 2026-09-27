export type Priority = "low" | "medium" | "high" | "urgent";

export interface Board {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  sort_order: number;
  wip_limit?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: Priority;
  due_date?: string | null;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  card_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  created_at: string;
}

export interface AppSettings {
  selected_board_id?: string;
  theme?: string;
  theme_family?: string;
  theme_mode?: string;
  search?: string;
  filters?: string;
}

export interface Snapshot {
  boards: Board[];
  columns: Column[];
  cards: Card[];
  settings: AppSettings;
  app_data_dir: string;
  database_path: string;
  vault_path?: string | null;
  vault_required: boolean;
  config_path: string;
  status_error?: string | null;
  app_version: string;
  check_for_updates: boolean;
}

export interface CardInput {
  id?: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: Priority;
  due_date?: string | null;
  color: string;
  sort_order?: number;
  tags: string[];
}

export interface CardOrderUpdate {
  id: string;
  column_id: string;
  sort_order: number;
}

export interface ImportSummary {
  boards: number;
  cards: number;
  attachments: number;
  backup_path: string;
}

export interface RestoreSummary {
  backup_path: string;
}

export type MoveDirection = "left" | "right" | "up" | "down";
