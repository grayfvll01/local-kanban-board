import { ArrowRight, LayoutPanelTop, Plus } from "lucide-react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ title, body, action, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state grid h-full place-items-center p-8">
      <div className="max-w-md text-center">
        <div className="empty-state-visual mx-auto mb-6" aria-hidden="true">
          <span className="empty-state-card card-one" />
          <span className="empty-state-card card-two" />
          <span className="empty-state-icon"><LayoutPanelTop size={24} /></span>
        </div>
        <span className="empty-state-kicker">Ready when you are</span>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em]">{title}</h2>
        <p className="themed-muted mx-auto mt-3 max-w-sm text-sm leading-6">{body}</p>
        {action && onAction ? (
          <button className="primary-button mt-7" onClick={onAction}>
            <Plus size={16} />
            {action}
            <ArrowRight size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
