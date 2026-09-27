import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  onNewCard: () => void;
  onNewColumn: () => void;
  onSearch: () => void;
}

/** App-wide shortcuts. They pause while any dialog or drawer is open. */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        if (event.shiftKey) latest.current.onNewColumn();
        else latest.current.onNewCard();
      } else if (key === "k" || key === "f") {
        event.preventDefault();
        latest.current.onSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
