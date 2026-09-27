import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "../lib/cn";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.closest("[hidden]") && element.offsetParent !== null,
  );
}

/** Moves focus into a modal surface on open and gives it back to the opener on close. */
export function useModalFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = ref.current;
    const target =
      container?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(container)[0] ?? container;
    target?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [ref]);
}

/** Keeps Tab inside the modal and closes it on Escape. */
export function handleModalKeyDown(event: KeyboardEvent, container: HTMLElement | null, onClose: () => void) {
  if (event.key === "Escape") {
    event.stopPropagation();
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const items = focusables(container);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  eyebrow?: string;
}

export function Dialog({ title, description, onClose, children, className, role = "dialog", eyebrow }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(panelRef);

  return (
    <div
      className="dialog-backdrop fixed inset-0 z-50 grid place-items-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn("dialog-panel", className)}
        onKeyDown={(event) => handleModalKeyDown(event, panelRef.current, onClose)}
      >
        {eyebrow ? <p className="themed-accent text-xs font-semibold uppercase tracking-[0.22em]">{eyebrow}</p> : null}
        <h2 id={titleId} className="themed-title text-lg font-bold tracking-[-0.01em]">
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="themed-muted mt-2 text-sm leading-6">
            {description}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
