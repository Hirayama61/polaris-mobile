import { useEffect, useState } from "react";
import { formatTokyoIso } from "../clock";
import { createMinimalDaily, extractReview, extractReviewAt, setReview, setReviewAt } from "../daily";
import { loadDraft, removeDraft, saveDraft } from "../drafts";
import { describeFailure, type Failure } from "../failure";
import { updateFile } from "../github";
import { appendJournal } from "../journal";
import type { Settings } from "../settings";
import { dailyPath, useDaily } from "../useDaily";
import { UnconfiguredCard } from "./common";

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
  | { status: "saved"; what: string }
  | { status: "error"; failure: Failure; isReviewSaved: boolean };

const journalPath = (date: string): string => `journal/${date}.md`;

// review_at(+09:00 つき ISO 8601)から時刻だけを出す。
const clockOf = (iso: string | undefined): string | undefined =>
  iso === undefined ? undefined : /T(\d{2}:\d{2})/.exec(iso)?.[1];

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため保存できません。",
  hint: "書いた内容はこの端末に残っています。つながったら保存してください。",
  action: "retry",
};

/**
 * 振り返りと日記を書き、daily と journal に commit する。
 */
export const NightScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const { state } = daily;
  const existingReview = state.status === "ready" ? extractReview(state.content) : "";
  const reviewKey = `review:${date}`;
  const journalKey = `journal:${date}`;
  const [review, setReviewDraft] = useState(() => loadDraft(reviewKey) ?? existingReview);
  const [journal, setJournal] = useState(() => loadDraft(journalKey) ?? "");
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  // daily を読み終えたら、既に書いてある振り返りを入力欄に入れる。書きかけがあれば上書きしない。
  const [hasEditedReview, setHasEditedReview] = useState(() => loadDraft(reviewKey) !== undefined);
  useEffect(() => {
    if (!hasEditedReview) {
      setReviewDraft(existingReview);
    }
  }, [existingReview, hasEditedReview]);

  if (state.status === "unconfigured") {
    return <UnconfiguredCard onOpenSettings={onOpenSettings} />;
  }

  const isReviewChanged = review.trim() !== existingReview.trim() && review.trim() !== "";
  const hasJournal = journal.trim() !== "";
  const canSave =
    (isReviewChanged || hasJournal) && save.status !== "saving" && state.status !== "loading";
  const savedAt = state.status === "ready" ? clockOf(extractReviewAt(state.content)) : undefined;

  const handleSave = (): void => {
    if (!canSave) {
      return;
    }
    if (!isOnline) {
      setSave({ status: "error", failure: OFFLINE_FAILURE, isReviewSaved: false });
      return;
    }
    setSave({ status: "saving" });
    const message = `chore(mobile): ${date} の振り返りと日記`;
    const now = new Date();
    const shouldWriteReview = isReviewChanged;
    const shouldWriteJournal = hasJournal;
    let isReviewSaved = false;
    const run = async (): Promise<void> => {
      if (shouldWriteReview) {
        const written = await updateFile(settings, dailyPath(date), message, (current) =>
          setReviewAt(setReview(current ?? createMinimalDaily(date), review), formatTokyoIso(now)),
        );
        isReviewSaved = true;
        removeDraft(reviewKey);
        setHasEditedReview(false);
        daily.replace(written.content, written.sha);
      }
      if (shouldWriteJournal) {
        await updateFile(settings, journalPath(date), message, (current) =>
          appendJournal(current, date, journal),
        );
        removeDraft(journalKey);
        setJournal("");
      }
    };
    const what = [shouldWriteReview ? "振り返り" : "", shouldWriteJournal ? "日記" : ""]
      .filter((name) => name !== "")
      .join("と");
    run()
      .then(() =>
        setSave({ status: "saved", what }),
      )
      .catch((error: unknown) =>
        setSave({ status: "error", failure: describeFailure(error), isReviewSaved }),
      );
  };

  return (
    <>
      {state.status === "error" && (
        <p className="banner">
          今日の計画を読めませんでした。書いた内容は保存するときに読み直して書き込みます。
        </p>
      )}

      <section className="section">
        <label className="field">
          <span className="section-head">
            <span className="section-title">振り返り</span>
            <span className="section-meta">
              {hasEditedReview && isReviewChanged
                ? "未保存"
                : savedAt !== undefined
                  ? `${savedAt} に保存済み`
                  : ""}
            </span>
          </span>
          <textarea
            className="textarea textarea-review"
            rows={6}
            value={review}
            placeholder="できたこと、明日に回すこと"
            onChange={(event) => {
              setHasEditedReview(true);
              setReviewDraft(event.target.value);
              saveDraft(reviewKey, event.target.value);
            }}
          />
        </label>
        {state.status === "missing" && (
          <p className="field-hint">今日の計画はまだありませんが、振り返りは保存できます。</p>
        )}
      </section>

      <section className="section">
        <label className="field">
          <span className="section-head">
            <span className="section-title">日記</span>
            <span className="section-meta">保存すると今日の日記に追記</span>
          </span>
          <textarea
            className="textarea textarea-journal"
            rows={8}
            value={journal}
            placeholder="思ったことを自由に"
            onChange={(event) => {
              setJournal(event.target.value);
              saveDraft(journalKey, event.target.value);
            }}
          />
        </label>
      </section>

      <div className="save-bar">
        {save.status === "saved" && !canSave && (
          <p className="save-note save-note-ok" role="status">
            {save.what}を保存しました
          </p>
        )}
        {save.status === "error" && (
          <div className="message message-error" role="alert">
            <p>
              {save.failure.reason}
              {save.isReviewSaved ? "振り返りは保存済みです。" : ""}
            </p>
            <p>{save.failure.hint}</p>
            {save.failure.action === "settings" && (
              <button type="button" className="button button-small" onClick={onOpenSettings}>
                設定を開く
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="button button-primary button-block"
          disabled={!canSave}
          onClick={handleSave}
        >
          {save.status === "saving" ? "保存中…" : "保存"}
        </button>
      </div>
    </>
  );
};
