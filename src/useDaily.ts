import { useCallback, useEffect, useRef, useState } from "react";
import { loadCachedFile, removeCachedFile, saveCachedFile } from "./cache";
import { describeFailure, type Failure } from "./failure";
import { readFile } from "./github";
import { beginLatest, cancelLatest, type LatestRef } from "./latest";
import { isConfigured, type Settings } from "./settings";

/**
 * 表示中の daily がリモートの最新かどうか。
 */
export type Freshness = { kind: "fresh" } | { kind: "refreshing" } | { kind: "stale"; failure: Failure };

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
 * daily を読み始める。キャッシュがあれば先にそれを `refreshing` で渡し、読み終えたら結果を渡す。
 * 後から始めた読み込みがあれば、この応答は捨てる。
 *
 * @param latest - 読み込みの世代。
 * @param settings - 接続設定。未設定なら読まずに `unconfigured` を渡す。
 * @param path - 読む daily のパス。
 * @param apply - 状態を受け取る関数。
 * @returns 応答を渡し終えたら解決する。
 */
export const startDailyLoad = async (
  latest: LatestRef,
  settings: Settings,
  path: string,
  apply: (state: DailyState) => void,
): Promise<void> => {
  if (!isConfigured(settings)) {
    cancelLatest(latest);
    apply({ status: "unconfigured" });
    return;
  }
  const isCurrent = beginLatest(latest);
  const cached = loadCachedFile(path);
  apply(
    cached === undefined
      ? { status: "loading" }
      : { status: "ready", ...cached, freshness: { kind: "refreshing" } },
  );
  try {
    const file = await readFile(settings, path);
    if (!isCurrent()) {
      return;
    }
    if (file.kind === "missing") {
      removeCachedFile(path);
      apply({ status: "missing" });
      return;
    }
    saveCachedFile(path, { content: file.content, sha: file.sha, fetchedAt: new Date().toISOString() });
    apply({ status: "ready", content: file.content, sha: file.sha, freshness: { kind: "fresh" } });
  } catch (error: unknown) {
    if (!isCurrent()) {
      return;
    }
    const failure = describeFailure(error);
    apply(
      cached === undefined
        ? { status: "error", failure }
        : { status: "ready", ...cached, freshness: { kind: "stale", failure } },
    );
  }
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
  const latest = useRef(0);
  const path = dailyPath(date);
  const currentPath = useRef(path);
  currentPath.current = path;

  useEffect(() => {
    void startDailyLoad(latest, settings, path, setState);
    return () => cancelLatest(latest);
  }, [settings, path]);

  const reload = (): void => {
    void startDailyLoad(latest, settings, path, setState);
  };

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
