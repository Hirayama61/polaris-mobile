import { useEffect, useRef, useState } from "react";
import { type BlogPost, loadBlogPosts } from "./blog";
import { describeFailure, type Failure } from "./failure";
import { createRepoReader } from "./github";
import { beginLatest, cancelLatest, type LatestRef } from "./latest";
import { isConfigured, type Settings } from "./settings";

export type BlogLoadState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "ready"; posts: BlogPost[] }
  | { status: "error"; failure: Failure };

/**
 * 記事の一覧を読み始め、読み終えたら `apply` に渡す。後から始めた読み込みがあれば、この応答は捨てる。
 *
 * @param latest - 読み込みの世代。
 * @param settings - 接続設定。未設定なら読まずに `unconfigured` を渡す。
 * @param apply - 状態を受け取る関数。
 * @returns 応答を渡し終えたら解決する。
 */
export const startBlogPostsLoad = async (
  latest: LatestRef,
  settings: Settings,
  apply: (state: BlogLoadState) => void,
): Promise<void> => {
  if (!isConfigured(settings)) {
    cancelLatest(latest);
    apply({ status: "unconfigured" });
    return;
  }
  const isCurrent = beginLatest(latest);
  const reader = createRepoReader(settings);
  const next = await loadBlogPosts(reader.listFileNames, reader.readText).then(
    (posts): BlogLoadState => ({ status: "ready", posts }),
    (error: unknown): BlogLoadState => ({ status: "error", failure: describeFailure(error) }),
  );
  if (isCurrent()) {
    apply(next);
  }
};

/**
 * `writing/blog/` の記事の一覧を読む。`reload` で読み直す。
 *
 * @remarks 書き込みは持たない。保存した部品が `reload` を呼ぶ。
 */
export const useBlogPosts = (settings: Settings): { state: BlogLoadState; reload: () => void } => {
  const [state, setState] = useState<BlogLoadState>({ status: "loading" });
  const latest = useRef(0);

  useEffect(() => {
    void startBlogPostsLoad(latest, settings, setState);
    return () => cancelLatest(latest);
  }, [settings]);

  // 失敗の後だけ読み込み中に戻す。保存の後の読み直しでは、読み終えるまで今の一覧を出しておく。
  const reload = (): void => {
    setState((current) => (current.status === "error" ? { status: "loading" } : current));
    void startBlogPostsLoad(latest, settings, setState);
  };

  return { state, reload };
};
