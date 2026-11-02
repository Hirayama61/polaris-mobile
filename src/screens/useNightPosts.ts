import { useEffect, useRef, useState } from "react";
import { describeFailure, type Failure } from "../failure";
import { readFile } from "../github";
import { extractPosts, type JournalPost, journalPath } from "../journal";
import { beginLatest, cancelLatest, type LatestRef } from "../latest";
import { waitForPost } from "../PostField";
import { isConfigured, type Settings } from "../settings";

export type PostsState =
  | { status: "loading" }
  | { status: "ready"; posts: JournalPost[] }
  | { status: "error"; failure: Failure };

/**
 * 今日の journal から投稿を読み始め、読み終えたら `apply` に渡す。後から始めた読み込みがあれば、この応答は捨てる。
 *
 * @param latest - 読み込みの世代。
 * @param settings - 接続設定。未設定なら何もしない。
 * @param date - 読む journal の日付。
 * @param apply - 状態を受け取る関数。
 * @returns 応答を渡し終えたら解決する。
 */
export const startPostsLoad = async (
  latest: LatestRef,
  settings: Settings,
  date: string,
  apply: (state: PostsState) => void,
): Promise<void> => {
  if (!isConfigured(settings)) {
    return;
  }
  const isCurrent = beginLatest(latest);
  // 送った投稿がまだ送信中なら、終わってから読む。先に読むと一覧に出ない。
  const next = await waitForPost()
    .then(() => readFile(settings, journalPath(date)))
    .then(
      (file): PostsState => ({
        status: "ready",
        posts: file.kind === "found" ? extractPosts(file.content) : [],
      }),
      (error: unknown): PostsState => ({ status: "error", failure: describeFailure(error) }),
    );
  if (isCurrent()) {
    apply(next);
  }
};

/**
 * 今日の journal の投稿を読む。日記を保存したか投稿を送ったか「読み直す」を押したら、`reload` で読み直す。
 *
 * @param settings - 接続設定。
 * @param date - 読む日付。
 * @returns 状態と読み直す関数。
 */
export const useNightPosts = (
  settings: Settings,
  date: string,
): { posts: PostsState; reload: () => void } => {
  const [posts, setPosts] = useState<PostsState>({ status: "loading" });
  const latest = useRef(0);

  useEffect(() => {
    void startPostsLoad(latest, settings, date, setPosts);
    return () => cancelLatest(latest);
  }, [settings, date]);

  const reload = (): void => {
    void startPostsLoad(latest, settings, date, setPosts);
  };

  return { posts, reload };
};
