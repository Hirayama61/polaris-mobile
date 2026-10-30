import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { formatTokyoIso } from "./clock";
import { describeFailure, type Failure } from "./failure";
import { buildInboxNote, buildInboxPath, clearSentDraft, type FeedbackDraft, inboxSuffix } from "./feedback";
import { createFile } from "./github";
import type { Settings } from "./settings";
import { CloseIcon } from "./ui";

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; path: string }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  screenLabel: string;
  date: string;
  isOnline: boolean;
  draft: FeedbackDraft;
  onDraftChange: Dispatch<SetStateAction<FeedbackDraft>>;
  onClose: () => void;
  onOpenSettings: () => void;
};

/**
 * 書きかけを保存する鍵。App が `drafts.ts` で localStorage に残す。
 */
export const FEEDBACK_DRAFT_KEYS = { title: "feedback:title", body: "feedback:body" } as const;

/**
 * 思いつきを polaris-data の `inbox/` にファイルとして書くシート。
 *
 * 書きかけは閉じても消えないので、外側のタップや Esc で閉じてよい。
 * 送信中だけは閉じさせない。閉じて開き直すと送信中の状態を失い、同じ思いつきを 2 回書けてしまうため。
 */
export const FeedbackSheet = ({
  settings,
  screenLabel,
  date,
  isOnline,
  draft,
  onDraftChange,
  onClose,
  onOpenSettings,
}: Props) => {
  const [send, setSend] = useState<SendState>({ status: "idle" });
  const titleRef = useRef<HTMLInputElement>(null);
  const isSending = send.status === "sending";
  const close = (): void => {
    if (!isSending) {
      onClose();
    }
  };
  const isSendingRef = useRef(isSending);
  isSendingRef.current = isSending;

  useEffect(() => {
    titleRef.current?.focus();
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

  const update = (next: FeedbackDraft): void => {
    onDraftChange(next);
    if (send.status === "sent" || send.status === "error") {
      setSend({ status: "idle" });
    }
  };

  const blocker = settings.token === "" ? "トークンが未設定です。" : undefined;
  const canSend = draft.title.trim() !== "" && send.status !== "sending" && blocker === undefined;

  const handleSend = (): void => {
    if (!canSend) {
      return;
    }
    if (!isOnline) {
      setSend({
        status: "error",
        failure: {
          reason: "オフラインのため送れません。",
          hint: "書いた内容は残っています。つながったら送ってください。",
          action: "retry",
        },
      });
      return;
    }
    setSend({ status: "sending" });
    const created = formatTokyoIso(new Date());
    const path = buildInboxPath(created, inboxSuffix(Math.random));
    const note = buildInboxNote(draft, { screenLabel, date, version: __APP_VERSION__ }, created);
    const sent = draft;
    createFile(settings, path, note, `inbox: ${draft.title.trim()}`)
      .then(() => {
        setSend({ status: "sent", path });
        onDraftChange((current) => clearSentDraft(current, sent));
      })
      .catch((error: unknown) => setSend({ status: "error", failure: describeFailure(error) }));
  };

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="feedback-title" className="sheet-title">
            思いつきを送る
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
          <span className="field-label">タイトル</span>
          <input
            ref={titleRef}
            className="input"
            type="text"
            enterKeyHint="next"
            disabled={isSending}
            value={draft.title}
            placeholder="例: チェックした項目を下に回したい"
            onChange={(event) => update({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">
            詳しく<span className="field-optional">任意</span>
          </span>
          <textarea
            className="textarea textarea-feedback"
            rows={5}
            disabled={isSending}
            value={draft.body}
            placeholder="困ったこと、こうなってほしいこと"
            onChange={(event) => update({ ...draft, body: event.target.value })}
          />
        </label>
        <p className="field-hint">送り先: {settings.repo}/inbox</p>

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
          {send.status === "sending" ? "送信中…" : "送信"}
        </button>
      </div>
    </div>
  );
};
