import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Calendar,
  Check,
  ExternalLink,
  ImagePlus,
  Paperclip,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../db/api";
import { cn } from "../../lib/cn";
import type { Attachment, Card, CardInput, Column, Priority } from "../../types";

const colors = ["#14b8a6", "#3b82f6", "#8b5cf6", "#f97316", "#ef4444", "#64748b"];
const priorities: Priority[] = ["low", "medium", "high", "urgent"];

interface CardDrawerProps {
  card?: Card | null;
  boardId: string;
  columns: Column[];
  defaultColumnId?: string;
  onClose: () => void;
  onSave: (input: CardInput) => Promise<Card>;
  onDelete: (id: string) => Promise<void>;
  onReload: () => Promise<void>;
}

export function CardDrawer({
  card,
  boardId,
  columns,
  defaultColumnId,
  onClose,
  onSave,
  onDelete,
  onReload,
}: CardDrawerProps) {
  const [draft, setDraft] = useState<CardInput>(() => createDraft(card, boardId, defaultColumnId));
  const [preview, setPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(createDraft(card, boardId, defaultColumnId));
    setPreview(Boolean(card?.description));
    window.setTimeout(() => titleRef.current?.focus(), 80);
  }, [card, boardId, defaultColumnId]);

  useEffect(() => {
    const listener = () => void handleSave();
    document.addEventListener("kanban-save-card", listener);
    return () => document.removeEventListener("kanban-save-card", listener);
  });

  const attachmentByName = useMemo(() => {
    const map = new Map<string, Attachment>();
    card?.attachments.forEach((attachment) => map.set(attachment.file_name, attachment));
    return map;
  }, [card?.attachments]);

  const handleSave = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const saved = await onSave(draft);
      setDraft((current) => ({ ...current, id: saved.id, sort_order: saved.sort_order }));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const ensureSaved = async () => {
    if (draft.id) return draft.id;
    const saved = await onSave({ ...draft, title: draft.title.trim() || "Untitled card" });
    setDraft((current) => ({ ...current, id: saved.id, sort_order: saved.sort_order }));
    return saved.id;
  };

  const attachFile = async (file: File) => {
    const cardId = await ensureSaved();
    const dataBase64 = await fileToBase64(file);
    await api.addAttachment(cardId, file.name, file.type || "application/octet-stream", dataBase64);
    if (file.type.startsWith("image/")) {
      setDraft((current) => ({
        ...current,
        description: `${current.description.trim()}\n\n![${file.name}](attachment:${file.name})`.trim(),
      }));
    }
    await onReload();
  };

  const onPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .find((item): item is File => Boolean(item));
    if (file) {
      event.preventDefault();
      await attachFile(file);
    }
  };

  return (
    <div className="drawer-backdrop fixed inset-0 z-40 flex justify-end backdrop-blur-sm" onMouseDown={onClose}>
      <section
        className="drawer-panel"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Card details"
      >
        <div className="drawer-header flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <p className="themed-accent text-xs font-semibold uppercase tracking-[0.22em]">
              Card Details
            </p>
            <h2 className="themed-title mt-1 truncate text-xl font-semibold">
              {draft.title || "New card"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {draft.id ? (
              <button
                className="icon-button"
                title="Delete card"
                onClick={async () => {
                  if (draft.id) {
                    await onDelete(draft.id);
                    onClose();
                  }
                }}
              >
                <Trash2 size={17} />
              </button>
            ) : null}
            <button className="icon-button" title="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4">
            <label className="field">
              <span>Title</span>
              <input
                ref={titleRef}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Card title"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Column</span>
                <select
                  value={draft.column_id}
                  onChange={(event) => setDraft({ ...draft, column_id: event.target.value })}
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft({ ...draft, priority: event.target.value as Priority })
                  }
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <label className="field">
                <span>Due date</span>
                <div className="relative">
                  <Calendar className="themed-muted pointer-events-none absolute left-3 top-2.5" size={16} />
                  <input
                    className="pl-9"
                    type="date"
                    value={draft.due_date ?? ""}
                    onChange={(event) => setDraft({ ...draft, due_date: event.target.value || null })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Color</span>
                <div className="color-swatch-tray flex h-10 items-center gap-2 rounded-lg px-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      className={cn(
                        "color-swatch h-5 w-5 rounded-full",
                        draft.color === color && "is-selected",
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setDraft({ ...draft, color })}
                    />
                  ))}
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                    className="h-6 w-8 border-0 bg-transparent p-0"
                  />
                </div>
              </label>
            </div>

            <label className="field">
              <span>Tags</span>
              <input
                value={draft.tags.join(", ")}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="design, release, blocked"
              />
            </label>

            <div className="themed-panel rounded-xl">
              <div className="drawer-header flex items-center justify-between border-b px-4 py-3">
                <span className="themed-title text-sm font-medium">Markdown</span>
                <div className="flex items-center gap-2">
                  <button
                    className={cn("segmented-button", !preview && "is-active")}
                    onClick={() => setPreview(false)}
                  >
                    Edit
                  </button>
                  <button
                    className={cn("segmented-button", preview && "is-active")}
                    onClick={() => setPreview(true)}
                  >
                    Preview
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (event) => {
                      for (const file of Array.from(event.target.files ?? [])) {
                        await attachFile(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <button className="icon-button" title="Attach file" onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={16} />
                  </button>
                </div>
              </div>
              {preview ? (
                <div className="markdown-body min-h-72 p-4">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img({ src = "", alt }) {
                        const attachment = src.startsWith("attachment:")
                          ? attachmentByName.get(src.replace("attachment:", ""))
                          : undefined;
                        return (
                          <img
                            src={attachment ? convertFileSrc(attachment.file_path) : src}
                            alt={alt ?? ""}
                          />
                        );
                      },
                    }}
                  >
                    {draft.description || "_No details yet._"}
                  </ReactMarkdown>
                </div>
              ) : (
                <textarea
                  className="themed-subtitle min-h-72 w-full resize-y border-0 bg-transparent p-4 font-mono text-sm leading-6 outline-none"
                  value={draft.description}
                  onPaste={onPaste}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="- [ ] Checklist item&#10;&#10;Paste an image here or attach a file."
                />
              )}
            </div>

            {card?.attachments.length ? (
              <div className="themed-panel rounded-xl p-4">
                <div className="themed-title mb-3 flex items-center gap-2 text-sm font-medium">
                  <Paperclip size={16} />
                  Attachments
                </div>
                <div className="grid gap-2">
                  {card.attachments.map((attachment) => (
                    <div key={attachment.id} className="attachment-row">
                      <span className="themed-subtitle min-w-0 flex-1 truncate text-sm">
                        {attachment.file_name}
                      </span>
                      <button
                        className="icon-button-subtle"
                        title="Open attachment"
                        onClick={() => api.openPath(attachment.file_path)}
                      >
                        <ExternalLink size={15} />
                      </button>
                      <button
                        className="icon-button-subtle"
                        title="Remove attachment"
                        onClick={async () => {
                          await api.deleteAttachment(attachment.id);
                          await onReload();
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="drawer-footer flex items-center justify-between border-t px-6 py-4">
          <p className="themed-muted text-xs">
            Changes are saved automatically. Press Ctrl+S while editing to save immediately.
          </p>
          <button className="primary-button" disabled={saving || !draft.title.trim()} onClick={handleSave}>
            {saving ? <Check size={16} /> : <Save size={16} />}
            {saving ? "Saved" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function createDraft(card: Card | null | undefined, boardId: string, defaultColumnId?: string): CardInput {
  return {
    id: card?.id,
    board_id: boardId,
    column_id: card?.column_id ?? defaultColumnId ?? "",
    title: card?.title ?? "",
    description: card?.description ?? "",
    priority: card?.priority ?? "medium",
    due_date: card?.due_date ?? null,
    color: card?.color ?? defaultCardColor(),
    sort_order: card?.sort_order,
    tags: card?.tags ?? [],
  };
}

function defaultCardColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#14b8a6"
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}
