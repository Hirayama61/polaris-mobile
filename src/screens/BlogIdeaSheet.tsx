import { type PropsWithChildren, useEffect, useRef } from "react";
import type { Settings } from "../settings";
import { CloseIcon } from "../ui";
import { useBlogIdea } from "./useBlogIdea";

type FrameProps = PropsWithChildren<{
  isBusy: boolean;
  onClose: () => void;
}>;

const BLOG_IDEA_TITLE_ID = "blog-idea-title";

/**
 * アイデアのシートの枠。外側のタップと Esc で閉じる。
 *
 * @remarks 配置だけを持つ。送信中は閉じさせない。閉じて開き直すと送信中の状態を失い、同じアイデアを 2 回書けてしまうため。
 */
const BlogIdeaSheetFrame = (props: FrameProps) => {
  const { isBusy, onClose, children } = props;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  const close = (): void => {
    if (!isBusy) {
      onClose();
    }
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      const isEscape = event.key === "Escape";
      if (isEscape && !isBusyRef.current) {
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

  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-scrim" aria-hidden="true" tabIndex={-1} onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={BLOG_IDEA_TITLE_ID}>
        <div className="sheet-head">
          <h2 id={BLOG_IDEA_TITLE_ID} className="sheet-title">
            アイデアを書く
          </h2>
          <button type="button" className="icon-button" aria-label="閉じる" disabled={isBusy} onClick={close}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

type Props = {
  settings: Settings;
  isOnline: boolean;
  onClose: () => void;
  /** 書き終えたとき。ブログの一覧を読み直すのに使う。 */
  onSent: () => void;
  onOpenSettings: () => void;
};

/**
 * ブログのアイデアを polaris-data の `writing/blog/ideas/` に新しいファイルとして書くシート。
 *
 * 書きかけは閉じても消えないので、外側のタップや Esc で閉じてよい。
 *
 * @remarks 一覧は持たない。読み直しは `onSent` を受けた Blog 画面が決める。
 * 本文と送信は `useBlogIdea`、閉じる操作は `BlogIdeaSheetFrame` が持つ。
 */
export const BlogIdeaSheet = (props: Props) => {
  const { settings, isOnline, onClose, onSent, onOpenSettings } = props;
  const { body, send, isSending, hasToken, canSend, update, handleSend } = useBlogIdea(
    settings,
    isOnline,
    onSent,
  );
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sendLabel = isSending ? "送信中…" : "送信";
  const isError = send.status === "error";
  const isSent = send.status === "sent";

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  return (
    <BlogIdeaSheetFrame isBusy={isSending} onClose={onClose}>
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

      {!hasToken && (
        <div className="message message-error" role="alert">
          <p>トークンが未設定です。</p>
          <button type="button" className="button button-small" onClick={onOpenSettings}>
            設定を開く
          </button>
        </div>
      )}
      {isError && (
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
      {isSent && (
        <div className="message message-ok" role="status">
          <p>アイデアを書きました。</p>
          <p className="field-hint">{send.path}</p>
        </div>
      )}

      <button
        type="button"
        className="button button-primary button-block"
        disabled={!canSend}
        onClick={handleSend}
      >
        {sendLabel}
      </button>
    </BlogIdeaSheetFrame>
  );
};
