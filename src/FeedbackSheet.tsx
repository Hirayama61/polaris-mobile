import { useEffect, useRef, useState } from "react";
import { removeDraft, saveDraft } from "./drafts";
import { buildIssueBody, parseRepoSlug } from "./feedback";
import { describeFailure, type Failure } from "./failure";
import { createIssue, type CreatedIssue } from "./github";
import type { Settings } from "./settings";
import { CloseIcon } from "./ui";

/**
 * 要望の書きかけ。シートを閉じても App が持ち続ける。
 */
export type FeedbackDraft = {
  title: string;
  body: string;
};

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; issue: CreatedIssue }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  screenLabel: string;
  date: string;
  isOnline: boolean;
  draft: FeedbackDraft;
  onDraftChange: (draft: FeedbackDraft) => void;
  onClose: () => void;
  onOpenSettings: () => void;
};

/**
 * 書きかけを保存する鍵。`drafts.ts` で localStorage に残す。
 */
export const FEEDBACK_DRAFT_KEYS = { title: "feedback:title", body: "feedback:body" } as const;

/**
 * 要望を GitHub Issue として送るシート。
 *
 * 書きかけは閉じても消えないので、外側のタップや Esc で閉じてよい。
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
  const target = parseRepoSlug(settings.issueRepo);

  useEffect(() => {
    titleRef.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
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
    saveDraft(FEEDBACK_DRAFT_KEYS.title, next.title);
    saveDraft(FEEDBACK_DRAFT_KEYS.body, next.body);
    if (send.status === "sent" || send.status === "error") {
      setSend({ status: "idle" });
    }
  };

  const blocker =
    settings.token === ""
      ? "トークンが未設定です。"
      : target === undefined
        ? "送り先のリポジトリが owner/repo の形になっていません。"
        : undefined;
  const canSend = draft.title.trim() !== "" && send.status !== "sending" && blocker === undefined;

  const handleSend = (): void => {
    if (!canSend || target === undefined) {
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
    const body = buildIssueBody(draft.body, { screenLabel, date, version: __APP_VERSION__ });
    createIssue(settings.token, target, draft.title.trim(), body)
      .then((issue) => {
        setSend({ status: "sent", issue });
        removeDraft(FEEDBACK_DRAFT_KEYS.title);
        removeDraft(FEEDBACK_DRAFT_KEYS.body);
        onDraftChange({ title: "", body: "" });
      })
      .catch((error: unknown) => setSend({ status: "error", failure: describeFailure(error) }));
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="feedback-title" className="sheet-title">
            要望を送る
          </h2>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
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
            value={draft.body}
            placeholder="困ったこと、こうなってほしいこと"
            onChange={(event) => update({ ...draft, body: event.target.value })}
          />
        </label>
        <p className="field-hint">送り先: {settings.issueRepo}</p>

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
            #{send.issue.number} を作りました。
            <a href={send.issue.url} target="_blank" rel="noreferrer">
              {send.issue.url.replace(/^https:\/\//, "")}
            </a>
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
