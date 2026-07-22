import { useEffect } from "react";

interface ShortcutHandlers {
  onNewCard: () => void;
  onNewColumn: () => void;
  onSearch: () => void;
  onSave: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === "n") {
        event.preventDefault();
        if (event.shiftKey) handlers.onNewColumn();
        else handlers.onNewCard();
      }
      if (event.ctrlKey && (key === "f" || key === "k")) {
        event.preventDefault();
        handlers.onSearch();
      }
      if (event.ctrlKey && key === "s") {
        event.preventDefault();
        handlers.onSave();
      }
      if (event.key === "Escape") {
        handlers.onEscape();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
