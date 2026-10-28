import { useCallback, useEffect, useState } from "react";
import { loadCachedFile, removeCachedFile, saveCachedFile } from "./cache";
import { GitHubError, readFile } from "./github";
import { isConfigured, type Settings } from "./settings";

/**
 * 読み込んだ daily の状態。
 *
 * `ready` の `notice` は、キャッシュ表示など利用者に伝えるべき事情。
 */
export type DailyState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "ready"; content: string; sha: string; notice: string | undefined }
  | { status: "missing" }
  | { status: "error"; message: string };

/**
 * daily のパスを作る。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns `daily/YYYY-MM-DD.md`。
 */
export const dailyPath = (date: string): string => `daily/${date}.md`;

const describe = (error: unknown): string => {
  if (error instanceof GitHubError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

/**
 * 今日の daily を GitHub から読み、オフラインならキャッシュで代える。
 *
 * @param settings - 接続設定。未設定なら `unconfigured` のまま読まない。
 * @param date - 読む日付。
 * @returns 状態、再読み込み、書き込み後に手元の内容を差し替える関数。
 */
export const useDaily = (
  settings: Settings,
  date: string,
): {
  state: DailyState;
  reload: () => void;
  replace: (content: string, sha: string) => void;
} => {
  const [state, setState] = useState<DailyState>({ status: "unconfigured" });
  const [reloadCount, setReloadCount] = useState(0);
  const path = dailyPath(date);

  useEffect(() => {
    if (!isConfigured(settings)) {
      setState({ status: "unconfigured" });
      return;
    }
    let isCancelled = false;
    const cached = loadCachedFile(path);
    setState(
      cached === undefined
        ? { status: "loading" }
        : { status: "ready", ...cached, notice: "読み込み中(前回の内容)" },
    );
    readFile(settings, path)
      .then((file) => {
        if (isCancelled) {
          return;
        }
        if (file.kind === "missing") {
          removeCachedFile(path);
          setState({ status: "missing" });
          return;
        }
        saveCachedFile(path, {
          content: file.content,
          sha: file.sha,
          fetchedAt: new Date().toISOString(),
        });
        setState({ status: "ready", content: file.content, sha: file.sha, notice: undefined });
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }
        const message = describe(error);
        if (cached === undefined) {
          setState({ status: "error", message });
          return;
        }
        setState({
          status: "ready",
          ...cached,
          notice: `GitHub から読めないため前回の内容を表示しています (${message})`,
        });
      });
    return () => {
      isCancelled = true;
    };
  }, [settings, path, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const replace = useCallback(
    (content: string, sha: string) => {
      saveCachedFile(path, { content, sha, fetchedAt: new Date().toISOString() });
      setState({ status: "ready", content, sha, notice: undefined });
    },
    [path],
  );

  return { state, reload, replace };
};
