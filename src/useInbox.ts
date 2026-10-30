import { useCallback, useEffect, useState } from "react";
import { describeFailure, type Failure } from "./failure";
import { listFileNames, readText } from "./github";
import { type InboxItem, loadInbox } from "./inbox";
import { isConfigured, type Settings } from "./settings";

export type InboxLoadState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "ready"; items: InboxItem[] }
  | { status: "error"; failure: Failure };

/**
 * 受信箱の全件を読む。`reload` で読み直す。
 *
 * @remarks 書き込みは持たない。タブの「!」のため、受信箱を開く前から App が読む。
 */
export const useInbox = (settings: Settings): { state: InboxLoadState; reload: () => void } => {
  const [state, setState] = useState<InboxLoadState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);
  // 失敗の後だけ読み込み中に戻す。回答の後の読み直しでは、読み終えるまで今の一覧を出しておく。
  const reload = useCallback(() => {
    setState((current) => (current.status === "error" ? { status: "loading" } : current));
    setReloadCount((count) => count + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies(reloadCount): 読み直すためのきっかけ。中では使わない。
  useEffect(() => {
    if (!isConfigured(settings)) {
      setState({ status: "unconfigured" });
      return undefined;
    }
    let isCancelled = false;
    loadInbox(
      (path) => listFileNames(settings, path),
      (path) => readText(settings, path),
    )
      .then((items) => {
        if (!isCancelled) {
          setState({ status: "ready", items });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({ status: "error", failure: describeFailure(error) });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [settings, reloadCount]);

  return { state, reload };
};
