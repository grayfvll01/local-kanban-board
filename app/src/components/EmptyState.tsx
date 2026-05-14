import { Plus } from "lucide-react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ title, body, action, onAction }: EmptyStateProps) {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-md text-center">
        <div className="themed-icon-tile mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl">
          <Plus size={26} />
        </div>
        <h2 className="themed-title text-xl font-semibold">{title}</h2>
        <p className="themed-muted mt-2 text-sm leading-6">{body}</p>
        {action && onAction ? (
          <button className="primary-button mt-6" onClick={onAction}>
            <Plus size={16} />
            {action}
          </button>
        ) : null}
      </div>
    </div>
  );
}
