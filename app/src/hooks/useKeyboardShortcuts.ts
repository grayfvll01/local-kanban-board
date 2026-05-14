import { useEffect } from "react";

interface ShortcutHandlers {
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
        handlers.onNewColumn();
      }
      if (event.ctrlKey && key === "f") {
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
