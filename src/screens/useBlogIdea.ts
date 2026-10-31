import { useState } from "react";
import { buildBlogIdea, toBlogIdeaId, toBlogPath } from "../blog";
import { formatTokyoIso } from "../clock";
import { loadDraft, remainingAfterSave, saveDraft } from "../drafts";
import { describeFailure, type Failure } from "../failure";
import { inboxSuffix } from "../feedback";
import { createFile } from "../github";
import type { Settings } from "../settings";

/**
 * 書きかけを保存する鍵。思いつきのシートとは別に持つ。
 */
export const BLOG_IDEA_DRAFT_KEY = "blog-idea:body";

/**
 * アイデアを送る状態。
 */
export type BlogIdeaSendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; path: string }
  | { status: "error"; failure: Failure };

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため送れません。",
  hint: "書いた内容は残っています。つながったら送ってください。",
  action: "retry",
};

/**
 * 送信ボタンを押せるか。送信中は押させない。押し直すと同じアイデアを 2 回書けてしまうため。
 *
 * @param body - 書いた本文。
 * @param send - 送る状態。
 * @param hasToken - トークンが設定されているか。
 */
export const canSendBlogIdea = (body: string, send: BlogIdeaSendState, hasToken: boolean): boolean => {
  const hasBody = body.trim() !== "";
  const isSending = send.status === "sending";
  return hasBody && !isSending && hasToken;
};

/**
 * アイデアを `writing/blog/ideas/` に新しいファイルとして書く。
 *
 * @remarks 既存のファイルは上書きしない (sha を付けずに書くので、同じパスがあれば GitHub が断る)。
 *
 * @param settings - 接続設定。
 * @param body - 書く本文。
 * @param now - 書いた時刻。ファイル名と frontmatter に使う。
 * @param random - ファイル名の末尾を作る乱数。
 * @returns 書いたファイルのパス。
 */
export const sendBlogIdea = async (
  settings: Settings,
  body: string,
  now: Date,
  random: () => number,
): Promise<string> => {
  const created = formatTokyoIso(now);
  const id = toBlogIdeaId(created, inboxSuffix(random));
  const path = toBlogPath("ideas", id);
  await createFile(settings, path, buildBlogIdea(body, created), `blog idea: ${id}`);
  return path;
};

/**
 * ブログのアイデアの本文と送信を持つ。書きかけは下書きに残す。
 *
 * @remarks 枠と閉じる操作は持たない。送信中に閉じさせないかはシートの枠が `isSending` で決める。
 *
 * @param settings - 接続設定。
 * @param isOnline - オンラインか。
 * @param onSent - 書けたときに呼ぶ。
 */
export const useBlogIdea = (settings: Settings, isOnline: boolean, onSent: () => void) => {
  const [body, setBody] = useState(() => loadDraft(BLOG_IDEA_DRAFT_KEY) ?? "");
  const [send, setSend] = useState<BlogIdeaSendState>({ status: "idle" });
  const isSending = send.status === "sending";
  const hasToken = settings.token !== "";
  const canSend = canSendBlogIdea(body, send, hasToken);

  const update = (next: string): void => {
    setBody(next);
    saveDraft(BLOG_IDEA_DRAFT_KEY, next);
    const isFinished = send.status === "sent" || send.status === "error";
    if (isFinished) {
      setSend({ status: "idle" });
    }
  };

  const handleSend = (): void => {
    if (!canSend) {
      return;
    }
    if (!isOnline) {
      setSend({ status: "error", failure: OFFLINE_FAILURE });
      return;
    }
    setSend({ status: "sending" });
    const sent = body;
    sendBlogIdea(settings, sent, new Date(), Math.random)
      .then((path) => {
        // 送信中に書き足した分は残す。
        const remaining = remainingAfterSave(loadDraft(BLOG_IDEA_DRAFT_KEY) ?? "", sent) ?? "";
        setBody(remaining);
        saveDraft(BLOG_IDEA_DRAFT_KEY, remaining);
        setSend({ status: "sent", path });
        onSent();
      })
      .catch((error: unknown) => setSend({ status: "error", failure: describeFailure(error) }));
  };

  return { body, send, isSending, hasToken, canSend, update, handleSend };
};
