import { convertFileSrc } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  FileImage,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { ClipboardEvent, DragEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConfirm } from "../../components/ConfirmDialog";
import { handleModalKeyDown, useModalFocus } from "../../components/Dialog";
import { api, errorMessage } from "../../db/api";
import { parseTags } from "../../lib/board";
import { cn } from "../../lib/cn";
import type { Attachment, Card, CardInput, Column, Priority } from "../../types";

const colors = ["#14b8a6", "#3b82f6", "#8b5cf6", "#f97316", "#ef4444", "#64748b"];
const priorities: Priority[] = ["low", "medium", "high", "urgent"];
const MAX_INLINE_FILE_BYTES = 50 * 1024 * 1024;

interface Draft {
  id?: string;
  column_id: string;
  title: string;
  description: string;
  priority: Priority;
  due_date: string;
  color: string;
  tagText: string;
}

interface CardDrawerProps {
  card?: Card | null;
  boardId: string;
  columns: Column[];
  defaultColumnId?: string;
  onClose: () => void;
  onSave: (input: CardInput) => Promise<Card>;
  onDelete: (id: string) => Promise<void>;
  onAttachmentsChanged: () => Promise<void>;
  onNotify: (message: string) => void;
}

export function CardDrawer({
  card,
  boardId,
  columns,
  defaultColumnId,
  onClose,
  onSave,
  onDelete,
  onAttachmentsChanged,
  onNotify,
}: CardDrawerProps) {
  // The draft is created once per opened task. Snapshot reloads (for example after an
  // attachment is added) must never overwrite edits the user has not saved yet.
  const [draft, setDraft] = useState<Draft>(() => createDraft(card, defaultColumnId ?? columns[0]?.id ?? ""));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [preview, setPreview] = useState(() => Boolean(card?.description));
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const confirm = useConfirm();
  useModalFocus(panelRef);

  const attachments = card?.attachments ?? [];
  const dirty = JSON.stringify(draft) !== baseline;
  const columnMissing = !columns.some((column) => column.id === draft.column_id);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const toInput = (value: Draft): CardInput => ({
    id: value.id,
    board_id: boardId,
    column_id: value.column_id,
    title: value.title.trim(),
    description: value.description,
    priority: value.priority,
    due_date: value.due_date || null,
    color: value.color,
    tags: parseTags(value.tagText),
  });

  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const discard = await confirm({
        title: "Discard unsaved changes?",
        message: "Your edits to this task haven't been saved.",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      setError("Add a title before saving.");
      return;
    }
    if (columnMissing) {
      setError("Choose a column for this task.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(toInput(draft));
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  /** Attachments need a saved task. New tasks are saved first, keeping the drawer open. */
  const ensureSaved = async () => {
    if (draft.id) return draft.id;
    const next = { ...draft, title: draft.title.trim() || "Untitled task" };
    const saved = await onSave(toInput(next));
    const stored = { ...next, id: saved.id };
    setDraft(stored);
    setBaseline(JSON.stringify(stored));
    return saved.id;
  };

  const appendImageLinks = (added: Attachment[]) => {
    const images = added.filter((item) => item.mime_type.startsWith("image/"));
    if (!images.length) return;
    const links = images.map((item) => `![${escapeAlt(item.file_name)}](attachment:${item.id})`).join("\n\n");
    setDraft((current) => ({ ...current, description: `${current.description.trimEnd()}\n\n${links}`.trim() }));
  };

  const runAttach = async (action: (cardId: string) => Promise<Attachment[]>) => {
    setAttaching(true);
    setError(null);
    try {
      const cardId = await ensureSaved();
      const added = await action(cardId);
      if (added.length) {
        appendImageLinks(added);
        await onAttachmentsChanged();
        onNotify(`${added.length} ${added.length === 1 ? "file" : "files"} attached`);
      }
    } catch (attachError) {
      setError(errorMessage(attachError));
    } finally {
      setAttaching(false);
    }
  };

  const attachInlineFiles = (files: File[]) =>
    runAttach(async (cardId) => {
      const added: Attachment[] = [];
      for (const file of files) {
        if (file.size > MAX_INLINE_FILE_BYTES) {
          throw new Error(`${file.name} is larger than 50 MB. Use Attach files instead.`);
        }
        const name = file.name || `pasted-image-${Date.now()}.png`;
        added.push(await api.addAttachment(cardId, name, file.type || "application/octet-stream", await fileToBase64(file)));
      }
      return added;
    });

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void attachInlineFiles(files);
  };

  const onDropFiles = (event: DragEvent<HTMLElement>) => {
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    event.preventDefault();
    void attachInlineFiles(files);
  };

  const removeAttachment = async (attachment: Attachment) => {
    const ok = await confirm({
      title: `Remove “${attachment.file_name}”?`,
      message: "The file will be deleted from your vault folder. This can't be undone.",
      confirmLabel: "Remove file",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteAttachment(attachment.id);
      await onAttachmentsChanged();
      onNotify("Attachment removed");
    } catch (removeError) {
      setError(errorMessage(removeError));
    }
  };

  const openAttachment = async (attachment: Attachment) => {
    try {
      const result = await api.openAttachment(attachment.id);
      if (result === "revealed") onNotify(`${attachment.file_name} can't be opened directly for safety, so it was shown in its folder.`);
    } catch (openError) {
      setError(errorMessage(openError));
    }
  };

  const requestDelete = async () => {
    if (!draft.id) return;
    const count = attachments.length;
    const ok = await confirm({
      title: "Delete this task?",
      message: `“${draft.title || "Untitled task"}”${count ? ` and its ${count} ${count === 1 ? "attachment" : "attachments"}` : ""} will be permanently removed. This can't be undone.`,
      confirmLabel: "Delete task",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await onDelete(draft.id);
      onClose();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  const markdownComponents = {
    img({ src, alt }: { src?: string | Blob; alt?: string }) {
      const value = typeof src === "string" ? src : "";
      if (!value.startsWith("attachment:")) {
        return <img src={value} alt={alt ?? ""} loading="lazy" />;
      }
      const attachment = findAttachment(attachments, value);
      if (!attachment) {
        return (
          <span className="missing-image">
            <FileImage size={15} aria-hidden="true" /> Image not found: {alt || "attachment"}
          </span>
        );
      }
      return <img src={convertFileSrc(attachment.file_path)} alt={alt ?? attachment.file_name} loading="lazy" />;
    },
    a({ href, children }: { href?: string; children?: ReactNode }) {
      return (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            if (!href) return;
            if (href.startsWith("attachment:")) {
              const attachment = findAttachment(attachments, href);
              if (attachment) void openAttachment(attachment);
              return;
            }
            if (/^(https?:|mailto:)/i.test(href)) {
              api.openUrl(href).catch((linkError) => setError(errorMessage(linkError)));
            }
          }}
        >
          {children}
        </a>
      );
    },
  };

  const titleText = draft.title.trim() || (draft.id ? "Untitled task" : "New task");

  return (
    <div
      className="drawer-backdrop fixed inset-0 z-40 flex justify-end"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void requestClose();
      }}
    >
      <section
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "s" || event.key === "Enter")) {
            event.preventDefault();
            void handleSave();
            return;
          }
          handleModalKeyDown(event, panelRef.current, () => void requestClose());
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={onDropFiles}
      >
        <div className="drawer-header flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0">
            <p className="themed-accent text-xs font-semibold uppercase tracking-[0.22em]">
              {draft.id ? "Task details" : "New task"}
            </p>
            <h2 id="task-drawer-title" className="themed-title mt-1 truncate text-xl font-semibold">
              {titleText}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {draft.id ? (
              <button type="button" className="icon-button" aria-label="Delete task" title="Delete task" onClick={() => void requestDelete()}>
                <Trash2 size={17} />
              </button>
            ) : null}
            <button type="button" className="icon-button" aria-label="Close" title="Close (Esc)" onClick={() => void requestClose()}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4">
            {error ? (
              <div className="inline-alert" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <label className="field">
              <span>Title</span>
              <input
                data-autofocus
                value={draft.title}
                maxLength={500}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="What needs to happen?"
                aria-invalid={Boolean(error && !draft.title.trim())}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Column</span>
                <select value={draft.column_id} onChange={(event) => update({ column_id: event.target.value })}>
                  {columnMissing ? <option value={draft.column_id}>Choose a column</option> : null}
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <select value={draft.priority} onChange={(event) => update({ priority: event.target.value as Priority })}>
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority[0].toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="field">
                <label htmlFor="task-due-date">Due date</label>
                <div className="relative flex items-center gap-2">
                  <Calendar className="themed-muted pointer-events-none absolute left-3 top-3" size={16} aria-hidden="true" />
                  <input
                    id="task-due-date"
                    className="pl-9"
                    type="date"
                    value={draft.due_date}
                    onChange={(event) => update({ due_date: event.target.value })}
                  />
                  {draft.due_date ? (
                    <button type="button" className="icon-button-subtle" aria-label="Clear due date" title="Clear due date" onClick={() => update({ due_date: "" })}>
                      <X size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
              <fieldset className="field">
                <legend>Color</legend>
                <div className="color-swatch-tray flex h-10 items-center gap-2 rounded-lg px-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      aria-pressed={draft.color === color}
                      title={color}
                      className={cn("color-swatch h-6 w-6 rounded-full", draft.color === color && "is-selected")}
                      style={{ backgroundColor: color }}
                      onClick={() => update({ color })}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={draft.color}
                    onChange={(event) => update({ color: event.target.value })}
                    className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                  />
                </div>
              </fieldset>
            </div>

            <label className="field">
              <span>Tags</span>
              <input
                value={draft.tagText}
                onChange={(event) => update({ tagText: event.target.value })}
                placeholder="design, release, blocked"
                aria-describedby="task-tags-hint"
              />
              <small id="task-tags-hint" className="field-hint">Separate tags with commas.</small>
            </label>

            <div className="themed-panel rounded-xl">
              <div className="drawer-header flex items-center justify-between gap-2 border-b px-4 py-3">
                <span className="themed-title text-sm font-medium" id="task-notes-label">Notes</span>
                <div className="flex items-center gap-2">
                  <div className="segmented" role="group" aria-label="Notes view">
                    <button type="button" className={cn("segmented-button", !preview && "is-active")} aria-pressed={!preview} onClick={() => setPreview(false)}>
                      Write
                    </button>
                    <button type="button" className={cn("segmented-button", preview && "is-active")} aria-pressed={preview} onClick={() => setPreview(true)}>
                      Preview
                    </button>
                  </div>
                  <button
                    type="button"
                    className="toolbar-button compact"
                    disabled={attaching}
                    onClick={() => void runAttach((cardId) => api.attachFiles(cardId))}
                  >
                    {attaching ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Paperclip size={15} aria-hidden="true" />}
                    {attaching ? "Attaching…" : "Attach files"}
                  </button>
                </div>
              </div>
              {preview ? (
                <div className="markdown-body min-h-72 p-4" aria-labelledby="task-notes-label">
                  {draft.description.trim() ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(url) => (url.startsWith("attachment:") ? url : defaultUrlTransform(url))}
                      components={markdownComponents}
                    >
                      {draft.description}
                    </ReactMarkdown>
                  ) : (
                    <button type="button" className="notes-empty" onClick={() => setPreview(false)}>
                      No notes yet. Select to start writing.
                    </button>
                  )}
                </div>
              ) : (
                <textarea
                  aria-labelledby="task-notes-label"
                  className="notes-input themed-subtitle min-h-72 w-full resize-y border-0 bg-transparent p-4 font-mono text-sm leading-6 outline-none"
                  value={draft.description}
                  onPaste={onPaste}
                  onChange={(event) => update({ description: event.target.value })}
                  placeholder={"Add details, links, or a checklist:\n- [ ] First step\n\nPaste or drop images to attach them."}
                />
              )}
            </div>

            {attachments.length ? (
              <section className="themed-panel rounded-xl p-4" aria-labelledby="task-attachments-label">
                <h3 id="task-attachments-label" className="themed-title mb-3 flex items-center gap-2 text-sm font-medium">
                  <Paperclip size={16} aria-hidden="true" />
                  Attachments ({attachments.length})
                </h3>
                <ul className="grid gap-2">
                  {attachments.map((attachment) => (
                    <li key={attachment.id} className="attachment-row">
                      <span className="themed-subtitle min-w-0 flex-1 truncate text-sm" title={attachment.file_name}>
                        {attachment.file_name}
                      </span>
                      <button
                        type="button"
                        className="icon-button-subtle"
                        aria-label={`Open ${attachment.file_name}`}
                        title="Open"
                        onClick={() => void openAttachment(attachment)}
                      >
                        <ExternalLink size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button-subtle"
                        aria-label={`Remove ${attachment.file_name}`}
                        title="Remove"
                        onClick={() => void removeAttachment(attachment)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>

        <div className="drawer-footer flex items-center justify-between gap-3 border-t px-6 py-4">
          <p className="themed-muted text-xs">
            {dirty ? "Unsaved changes · " : ""}Ctrl+S to save · Esc to close
          </p>
          <button type="button" className="primary-button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            {saving ? "Saving…" : "Save task"}
          </button>
        </div>
      </section>
    </div>
  );
}

function createDraft(card: Card | null | undefined, defaultColumnId: string): Draft {
  return {
    id: card?.id,
    column_id: card?.column_id ?? defaultColumnId,
    title: card?.title ?? "",
    description: card?.description ?? "",
    priority: card?.priority ?? "medium",
    due_date: card?.due_date ?? "",
    color: card?.color ?? defaultCardColor(),
    tagText: card?.tags.join(", ") ?? "",
  };
}

function defaultCardColor() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent.toLowerCase() : colors[1];
}

/** Supports `attachment:<id>` references and older `attachment:<file name>` ones. */
function findAttachment(attachments: Attachment[], reference: string) {
  const key = reference.slice("attachment:".length);
  let decoded = key;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    // Keep the raw value when it is not URI-encoded.
  }
  return attachments.find((item) => item.id === key) ?? attachments.find((item) => item.file_name === decoded);
}

function escapeAlt(value: string) {
  return value.replace(/[[\]\\]/g, "");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
