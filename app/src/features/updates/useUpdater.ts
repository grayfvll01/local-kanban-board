import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isBrowserPreview } from "../../db/api";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "available"; version: string; notes?: string }
  | { status: "installing"; version: string; progress: number | null }
  | { status: "error"; message: string };

const AUTO_CHECK_DELAY_MS = 5_000;

/** Checks GitHub Releases for a signed update. Offline or failed automatic checks stay silent. */
export function useUpdater(autoCheck: boolean) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const pending = useRef<Update | null>(null);
  const busy = useRef(false);

  const checkNow = useCallback(async (manual: boolean) => {
    if (isBrowserPreview || busy.current) return;
    busy.current = true;
    if (manual) setState({ status: "checking" });
    try {
      const update = await check({ timeout: 20_000 });
      pending.current = update;
      setState(update ? { status: "available", version: update.version, notes: update.body } : { status: "current" });
    } catch (error) {
      setState(
        manual
          ? { status: "error", message: `Couldn't check for updates. ${offlineHint(error)}` }
          : { status: "idle" },
      );
    } finally {
      busy.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update || busy.current) return;
    busy.current = true;
    let total = 0;
    let received = 0;
    setState({ status: "installing", version: update.version, progress: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setState({
            status: "installing",
            version: update.version,
            progress: total ? Math.min(100, Math.round((received / total) * 100)) : null,
          });
        }
      });
      await relaunch();
    } catch (error) {
      setState({ status: "error", message: `The update couldn't be installed. ${offlineHint(error)}` });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!autoCheck || isBrowserPreview) return;
    const timer = window.setTimeout(() => void checkNow(false), AUTO_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoCheck, checkNow]);

  return { state, checkNow, install };
}

function offlineHint(error: unknown) {
  const message = errorMessage(error);
  return /network|connect|dns|timed? ?out|offline|request/i.test(message)
    ? "Check your internet connection and try again."
    : message;
}
