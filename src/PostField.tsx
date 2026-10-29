import { useRef, useState, type FormEvent } from "react";
import { formatTokyoTime, polarisToday } from "./clock";
import { loadDraft, remainingAfterSave, removeDraft, saveDraft } from "./drafts";
import { describeFailure, type Failure } from "./failure";
import { updateFile } from "./github";
import { appendPost, journalPath } from "./journal";
import type { Settings } from "./settings";

type Props = {
  settings: Settings;
  isOnline: boolean;
  onOpenSettings: () => void;
};

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; time: string }
  | { status: "error"; failure: Failure };

const DRAFT_KEY = "post";

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため投稿できません。",
  hint: "書いた内容はこの端末に残っています。つながったら送ってください。",
  action: "retry",
};

/**
 * 1 行の投稿欄。送ると今日の journal に `- HH:MM 本文` を追記する。
 */
export const PostField = ({ settings, isOnline, onOpenSettings }: Props) => {
  const [text, setText] = useState(() => loadDraft(DRAFT_KEY) ?? "");
  const [send, setSend] = useState<SendState>({ status: "idle" });
  const latest = useRef(text);
  latest.current = text;
  const isSending = send.status === "sending";
  const canSend = text.trim() !== "" && !isSending;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    if (!isOnline) {
      setSend({ status: "error", failure: OFFLINE_FAILURE });
      return;
    }
    // 開いたまま 4:00 をまたいでも、投稿した時刻と同じ日の journal に書く。
    const now = new Date();
    const date = polarisToday(now);
    const time = formatTokyoTime(now);
    const sent = text;
    setSend({ status: "sending" });
    updateFile(settings, journalPath(date), `chore(mobile): ${date} の投稿`, (current) =>
      appendPost(current, date, time, sent),
    )
      .then(() => {
        if (remainingAfterSave(latest.current, sent) === undefined) {
          removeDraft(DRAFT_KEY);
          setText("");
        }
        setSend({ status: "sent", time });
      })
      .catch((error: unknown) => setSend({ status: "error", failure: describeFailure(error) }));
  };

  return (
    <section className="section" aria-labelledby="post-title">
      <div className="section-head">
        <h2 id="post-title" className="section-title">
          いまのこと
        </h2>
        {send.status === "sent" && (
          <span className="section-meta" role="status">
            {send.time} に投稿しました
          </span>
        )}
      </div>
      <form className="input-with-action" onSubmit={handleSubmit}>
        <input
          type="text"
          className="input"
          aria-labelledby="post-title"
          enterKeyHint="send"
          readOnly={isSending}
          value={text}
          placeholder="出来事をひとこと"
          onChange={(event) => {
            setText(event.target.value);
            saveDraft(DRAFT_KEY, event.target.value);
            if (send.status !== "sending") {
              setSend({ status: "idle" });
            }
          }}
        />
        <button type="submit" className="input-action" disabled={!canSend}>
          {isSending ? "送信中" : "送る"}
        </button>
      </form>
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
    </section>
  );
};
