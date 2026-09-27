import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Dialog } from "./Dialog";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/** Promise-based confirmation dialog shared by the whole app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(options);
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request ? (
        <Dialog
          role="alertdialog"
          title={request.title}
          description={request.message}
          onClose={() => settle(false)}
        >
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="toolbar-button" onClick={() => settle(false)} data-autofocus>
              {request.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              className={request.tone === "danger" ? "danger-button" : "primary-button"}
              onClick={() => settle(true)}
            >
              {request.confirmLabel}
            </button>
          </div>
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
