import { AlertTriangle, RotateCcw } from "lucide-react";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface State {
  error: Error | null;
}

/** Last line of defence: a render error shows a recovery screen instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Local Kanban crashed while rendering", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell grid h-screen place-items-center p-6">
        <section className="vault-panel text-center" role="alert">
          <div className="vault-app-mark mx-auto grid h-14 w-14 place-items-center rounded-2xl">
            <AlertTriangle size={26} />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.03em]">Something went wrong</h1>
          <p className="themed-muted mt-3 text-sm leading-6">
            Your boards are saved in your vault folder and were not affected. Reload to continue.
          </p>
          <p className="themed-muted mt-3 break-words text-xs">{this.state.error.message}</p>
          <button className="primary-button mt-6" onClick={() => window.location.reload()}>
            <RotateCcw size={16} /> Reload Local Kanban
          </button>
        </section>
      </div>
    );
  }
}
