import { useEffect, useState } from "react";
import { formatTokyoIso } from "../clock";
import { createMinimalDaily, extractReview, setReview, setReviewAt } from "../daily";
import { GitHubError, updateFile } from "../github";
import { appendJournal } from "../journal";
import type { Settings } from "../settings";
import { dailyPath, useDaily } from "../useDaily";

type Props = {
  settings: Settings;
  date: string;
  daily: ReturnType<typeof useDaily>;
  isOnline: boolean;
  onOpenSettings: () => void;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: string }
  | { status: "error"; message: string };

const describe = (error: unknown): string =>
  error instanceof GitHubError || error instanceof Error
    ? error.message
    : String(error);

const journalPath = (date: string): string => `journal/${date}.md`;

/**
 * 振り返りと日記を書き、daily と journal に commit する。
 */
export const NightScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const { state } = daily;
  const existingReview = state.status === "ready" ? extractReview(state.content) : "";
  const [review, setReviewDraft] = useState(existingReview);
  const [journal, setJournal] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  // daily を読み終えたら、既に書いてある振り返りを入力欄に入れる。手で編集を始めていれば上書きしない。
  const [hasEditedReview, setHasEditedReview] = useState(false);
  useEffect(() => {
    if (!hasEditedReview) {
      setReviewDraft(existingReview);
    }
  }, [existingReview, hasEditedReview]);

  if (state.status === "unconfigured") {
    return (
      <section className="card">
        <p>GitHub の設定がまだありません。</p>
        <button type="button" className="button button-primary" onClick={onOpenSettings}>
          設定を開く
        </button>
      </section>
    );
  }

  const hasReview = review.trim() !== "";
  const hasJournal = journal.trim() !== "";
  const canSave =
    (hasReview || hasJournal) && save.status !== "saving" && state.status !== "loading";

  const handleSave = (): void => {
    if (!canSave) {
      return;
    }
    if (!isOnline) {
      setSave({ status: "error", message: "オフラインです。オンラインになってから保存してください" });
      return;
    }
    setSave({ status: "saving" });
    const message = `chore(mobile): ${date} の振り返りと日記`;
    const now = new Date();
    const run = async (): Promise<void> => {
      if (hasReview) {
        const written = await updateFile(settings, dailyPath(date), message, (current) =>
          setReviewAt(setReview(current ?? createMinimalDaily(date), review), formatTokyoIso(now)),
        );
        daily.replace(written.content, written.sha);
      }
      if (hasJournal) {
        await updateFile(settings, journalPath(date), message, (current) =>
          appendJournal(current, date, journal),
        );
        setJournal("");
      }
    };
    run()
      .then(() => setSave({ status: "saved", at: now.toLocaleTimeString("ja-JP") }))
      .catch((error: unknown) =>
        setSave({ status: "error", message: `保存できませんでした: ${describe(error)}` }),
      );
  };

  return (
    <>
      {state.status === "loading" && <p className="status">読み込み中…</p>}
      {state.status === "error" && (
        <p className="message message-notice">
          daily を読めませんでした ({state.message})。保存時に読み直します。
        </p>
      )}
      {state.status === "missing" && (
        <p className="message message-notice">
          今日の計画はまだありません。振り返りは最小の daily を作って書きます。
        </p>
      )}
      {state.status === "ready" && state.notice !== undefined && (
        <p className="message message-notice">{state.notice}</p>
      )}

      <section className="card">
        <label className="field">
          <span className="field-label">振り返り</span>
          <textarea
            className="textarea"
            rows={6}
            value={review}
            placeholder="今日どうだった?"
            onChange={(event) => {
              setHasEditedReview(true);
              setReviewDraft(event.target.value);
            }}
          />
        </label>
        <p className="muted">
          <code>{dailyPath(date)}</code> の「振り返り」を置き換え、<code>review_at</code> を今の時刻にします。
        </p>
      </section>

      <section className="card">
        <label className="field">
          <span className="field-label">日記</span>
          <textarea
            className="textarea"
            rows={8}
            value={journal}
            placeholder="自由に"
            onChange={(event) => setJournal(event.target.value)}
          />
        </label>
        <p className="muted">
          <code>{journalPath(date)}</code> の末尾に追記します。
        </p>
      </section>

      <div className="actions">
        <button type="button" className="button button-primary" disabled={!canSave} onClick={handleSave}>
          {save.status === "saving" ? "保存中…" : "保存"}
        </button>
        {save.status === "saved" && <p className="message message-ok">{save.at} に保存しました</p>}
        {save.status === "error" && (
          <p className="message message-error" role="alert">
            {save.message}
          </p>
        )}
      </div>
    </>
  );
};
