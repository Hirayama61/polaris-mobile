import { useCallback, useEffect, useRef, useState } from "react";
import { loadCachedFile, removeCachedFile, saveCachedFile } from "./cache";
import { describeFailure, type Failure } from "./failure";
import { readFile } from "./github";
import { isConfigured, type Settings } from "./settings";

/**
 * 表示中の daily がリモートの最新かどうか。
 */
export type Freshness =
  | { kind: "fresh" }
  | { kind: "refreshing" }
  | { kind: "stale"; failure: Failure };

/**
 * 読み込んだ daily の状態。
 *
 * `ready` の `freshness` は表示中の内容がどこから来たか。
 * `refreshing` は前回の内容を出しながら読み直している途中、`stale` は読み直しに失敗して前回の内容を出している状態。
 */
export type DailyState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "ready"; content: string; sha: string; freshness: Freshness }
  | { status: "missing" }
  | { status: "error"; failure: Failure };

/**
 * daily のパスを作る。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns `daily/YYYY-MM-DD.md`。
 */
export const dailyPath = (date: string): string => `daily/${date}.md`;

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
  const currentPath = useRef(path);
  currentPath.current = path;

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
        : { status: "ready", ...cached, freshness: { kind: "refreshing" } },
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
        setState({ status: "ready", content: file.content, sha: file.sha, freshness: { kind: "fresh" } });
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }
        const failure = describeFailure(error);
        if (cached === undefined) {
          setState({ status: "error", failure });
          return;
        }
        setState({
          status: "ready",
          ...cached,
          freshness: { kind: "stale", failure },
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
      // 書き込み中に日付が変わったら、前日の内容で当日の表示を上書きしない。
      if (currentPath.current !== path) {
        return;
      }
      setState({ status: "ready", content, sha, freshness: { kind: "fresh" } });
    },
    [path],
  );

  return { state, reload, replace };
};
