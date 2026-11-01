import { useCallback, useEffect, useState } from "react";
import { type BlogPost, loadBlogPosts } from "./blog";
import { describeFailure, type Failure } from "./failure";
import { createRepoReader } from "./github";
import { isConfigured, type Settings } from "./settings";

export type BlogLoadState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "ready"; posts: BlogPost[] }
  | { status: "error"; failure: Failure };

/**
 * `writing/blog/` の記事の一覧を読む。`reload` で読み直す。
 *
 * @remarks 書き込みは持たない。保存した部品が `reload` を呼ぶ。
 */
export const useBlogPosts = (settings: Settings): { state: BlogLoadState; reload: () => void } => {
  const [state, setState] = useState<BlogLoadState>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);
  // 失敗の後だけ読み込み中に戻す。保存の後の読み直しでは、読み終えるまで今の一覧を出しておく。
  const reload = useCallback(() => {
    setState((current) => (current.status === "error" ? { status: "loading" } : current));
    setReloadCount((count) => count + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies(reloadCount): 保存の後に読み直すためのきっかけ。中では使わない。
  useEffect(() => {
    if (!isConfigured(settings)) {
      setState({ status: "unconfigured" });
      return undefined;
    }
    let isCancelled = false;
    const reader = createRepoReader(settings);
    loadBlogPosts(reader.listFileNames, reader.readText)
      .then((posts) => {
        if (!isCancelled) {
          setState({ status: "ready", posts });
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
