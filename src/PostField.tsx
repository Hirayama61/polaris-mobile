import { useEffect, useState, type FormEvent } from "react";
import { formatTokyoTime, polarisToday } from "./clock";
import { loadDraft, postDraftKey, remainingAfterSave, removeDraft, saveDraft } from "./drafts";
import { describeFailure, type Failure } from "./failure";
import { updateFile } from "./github";
import { appendPost, journalPath } from "./journal";
import type { Settings } from "./settings";

type Props = {
  settings: Settings;
  date: string;
  isOnline: boolean;
  onOpenSettings: () => void;
};

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; time: string }
  | { status: "error"; failure: Failure };

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため投稿できません。",
  hint: "書いた内容はこの端末に残っています。つながったら送ってください。",
  action: "retry",
};

type Outcome = { status: "sent"; time: string } | { status: "error"; failure: Failure };

// タブを切り替えると投稿欄はアンマウントされるが送信は続く。戻ったときに送信中を引き継いで二重送信させないよう、モジュールに持つ。
let inFlight: Promise<Outcome> | undefined;

const startSend = (settings: Settings, draftKey: string, sent: string): Promise<Outcome> => {
  // 開いたまま 4:00 をまたいでも、投稿した時刻と同じ日の journal に書く。
  const now = new Date();
  const date = polarisToday(now);
  const time = formatTokyoTime(now);
  const promise = updateFile(settings, journalPath(date), `chore(mobile): ${date} の投稿`, (current) =>
    appendPost(current, date, time, sent),
  )
    .then((): Outcome => {
      // 送信中に書き足した分は残す。
      if (remainingAfterSave(loadDraft(draftKey) ?? "", sent) === undefined) {
        removeDraft(draftKey);
      }
      return { status: "sent", time };
    })
    .catch((error: unknown): Outcome => ({ status: "error", failure: describeFailure(error) }))
    .finally(() => {
      inFlight = undefined;
    });
  inFlight = promise;
  return promise;
};

/**
 * 1 行の投稿欄。送ると今日の journal に `- HH:MM 本文` を追記する。
 */
export const PostField = ({ settings, date, isOnline, onOpenSettings }: Props) => {
  // 日付が変わったら呼び出し側が key で作り直すので、鍵はマウント時の date のままでよい。
  const draftKey = postDraftKey(date);
  const [text, setText] = useState(() => loadDraft(draftKey) ?? "");
  const [send, setSend] = useState<SendState>(() =>
    inFlight === undefined ? { status: "idle" } : { status: "sending" },
  );
  const isSending = send.status === "sending";
  const canSend = text.trim() !== "" && !isSending && inFlight === undefined;

  const track = (promise: Promise<Outcome>): (() => void) => {
    let isMounted = true;
    void promise.then((outcome) => {
      if (isMounted) {
        setText(loadDraft(draftKey) ?? "");
        setSend(outcome);
      }
    });
    return () => {
      isMounted = false;
    };
  };

  // マウント時に前回の送信が続いていれば、その結果を待つ。
  useEffect(() => (inFlight === undefined ? undefined : track(inFlight)), []);

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    if (!isOnline) {
      setSend({ status: "error", failure: OFFLINE_FAILURE });
      return;
    }
    setSend({ status: "sending" });
    track(startSend(settings, draftKey, text));
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
            saveDraft(draftKey, event.target.value);
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
