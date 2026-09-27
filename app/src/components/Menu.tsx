import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

interface MenuProps {
  label: string;
  icon: ReactNode;
  buttonClassName: string;
  menuClassName?: string;
  children: ReactNode;
}

/** A small accessible menu: closes on outside click, Escape, or selection. */
export function Menu({ label, icon, buttonClassName, menuClassName, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(items.length - 1);
    else if (event.key === "Tab") setOpen(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
  };

  return (
    <div className="context-menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
      </button>
      {open ? (
        <div
          ref={menuRef}
          className={cn("context-menu", menuClassName)}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) {
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
  shortcut,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  shortcut?: string;
}) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={cn(danger && "is-danger")} onClick={onSelect}>
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut ? <kbd className="menu-shortcut">{shortcut}</kbd> : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <span className="context-menu-label" role="presentation">{children}</span>;
}
