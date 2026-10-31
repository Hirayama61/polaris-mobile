import { useEffect, useRef, useState } from "react";
import { buildBlogIdea, toBlogIdeaId, toBlogPath } from "../blog";
import { formatTokyoIso } from "../clock";
import { loadDraft, remainingAfterSave, saveDraft } from "../drafts";
import { describeFailure, type Failure } from "../failure";
import { inboxSuffix } from "../feedback";
import { createFile } from "../github";
import type { Settings } from "../settings";
import { CloseIcon } from "../ui";

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; path: string }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  isOnline: boolean;
  onClose: () => void;
  /** 書き終えたとき。ブログの一覧を読み直すのに使う。 */
  onSent: () => void;
  onOpenSettings: () => void;
};

/**
 * 書きかけを保存する鍵。思いつきのシートとは別に持つ。
 */
export const BLOG_IDEA_DRAFT_KEY = "blog-idea:body";

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため送れません。",
  hint: "書いた内容は残っています。つながったら送ってください。",
  action: "retry",
};

/**
 * ブログのアイデアを polaris-data の `writing/blog/ideas/` に新しいファイルとして書くシート。
 *
 * 書きかけは閉じても消えないので、外側のタップや Esc で閉じてよい。
 * 送信中だけは閉じさせない。閉じて開き直すと送信中の状態を失い、同じアイデアを 2 回書けてしまうため。
 *
 * @remarks 一覧は持たない。読み直しは `onSent` を受けた Blog 画面が決める。
 */
export const BlogIdeaSheet = (props: Props) => {
  const { settings, isOnline, onClose, onSent, onOpenSettings } = props;
  const [body, setBody] = useState(() => loadDraft(BLOG_IDEA_DRAFT_KEY) ?? "");
  const [send, setSend] = useState<SendState>({ status: "idle" });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const isSending = send.status === "sending";
  const isSendingRef = useRef(isSending);
  isSendingRef.current = isSending;

  const close = (): void => {
    if (!isSending) {
      onClose();
    }
  };

  useEffect(() => {
    bodyRef.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isSendingRef.current) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    // 背面のスクロールを止める。
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const update = (next: string): void => {
    setBody(next);
    saveDraft(BLOG_IDEA_DRAFT_KEY, next);
    if (send.status === "sent" || send.status === "error") {
      setSend({ status: "idle" });
    }
  };

  const blocker = settings.token === "" ? "トークンが未設定です。" : undefined;
  const hasBody = body.trim() !== "";
  const canSend = hasBody && !isSending && blocker === undefined;
  const sendLabel = isSending ? "送信中…" : "送信";

  const handleSend = (): void => {
    if (!canSend) {
      return;
    }
    if (!isOnline) {
      setSend({ status: "error", failure: OFFLINE_FAILURE });
      return;
    }
    setSend({ status: "sending" });
    const created = formatTokyoIso(new Date());
    const id = toBlogIdeaId(created, inboxSuffix(Math.random));
    const path = toBlogPath("ideas", id);
    const sent = body;
    createFile(settings, path, buildBlogIdea(sent, created), `blog idea: ${id}`)
      .then(() => {
        // 送信中に書き足した分は残す。
        const remaining = remainingAfterSave(loadDraft(BLOG_IDEA_DRAFT_KEY) ?? "", sent) ?? "";
        setBody(remaining);
        saveDraft(BLOG_IDEA_DRAFT_KEY, remaining);
        setSend({ status: "sent", path });
        onSent();
      })
      .catch((error: unknown) => setSend({ status: "error", failure: describeFailure(error) }));
  };

  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-scrim" aria-hidden="true" tabIndex={-1} onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="blog-idea-title">
        <div className="sheet-head">
          <h2 id="blog-idea-title" className="sheet-title">
            アイデアを書く
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="閉じる"
            disabled={isSending}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>

        <label className="field">
          <span className="field-label">アイデア</span>
          <textarea
            ref={bodyRef}
            className="textarea textarea-blog-idea"
            rows={8}
            disabled={isSending}
            value={body}
            placeholder={"# 書きたいこと\n\n- 伝えたいこと\n- きっかけ"}
            onChange={(event) => update(event.target.value)}
          />
        </label>
        <p className="field-hint">送り先: {settings.repo}/writing/blog/ideas。書いたまま保存します。</p>

        {blocker !== undefined && (
          <div className="message message-error" role="alert">
            <p>{blocker}</p>
            <button type="button" className="button button-small" onClick={onOpenSettings}>
              設定を開く
            </button>
          </div>
        )}
        {send.status === "error" && (
          <div className="message message-error" role="alert">
            <p>{send.failure.reason}</p>
            <p>{send.failure.hint}</p>
            {send.failure.action === "settings" && (
              <button type="button" className="button button-small" onClick={onOpenSettings}>
                設定を開く
              </button>
            )}
          </div>
        )}
        {send.status === "sent" && (
          <p className="message message-ok" role="status">
            {send.path} に書きました。
          </p>
        )}

        <button
          type="button"
          className="button button-primary button-block"
          disabled={!canSend}
          onClick={handleSend}
        >
          {sendLabel}
        </button>
      </div>
    </div>
  );
};
