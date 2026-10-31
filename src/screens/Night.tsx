import { useCallback, useEffect, useRef, useState } from "react";
import { formatTokyoIso } from "../clock";
import {
  createMinimalDaily,
  extractReview,
  extractReviewAt,
  getCheckedTurns,
  getDoneScheduleRows,
  setReview,
  setReviewAt,
} from "../daily";
import { loadDraft, nightDraftKeys, remainingAfterSave, removeDraft, saveDraft } from "../drafts";
import { describeFailure, type Failure } from "../failure";
import { readFile, updateFile } from "../github";
import { appendJournal, extractPosts, type JournalPost, journalPath } from "../journal";
import { toKeyedItems } from "../keys";
import { PostField, waitForPost } from "../PostField";
import { isConfigured, type Settings } from "../settings";
import { dailyPath, type useDaily } from "../useDaily";
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

// review_at(+09:00 つき ISO 8601)から時刻だけを出す。
const clockOf = (iso: string | undefined): string | undefined =>
  iso === undefined ? undefined : /T(\d{2}:\d{2})/.exec(iso)?.[1];

type PostsState = { status: "loading" } | { status: "ready"; posts: JournalPost[] } | { status: "error" };

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため保存できません。",
  hint: "書いた内容はこの端末に残っています。つながったら保存してください。",
  action: "retry",
};

// 今日の journal から投稿を読む。日記を保存したか投稿を送ったら reloadKey を変えて読み直す。
// 送った投稿がまだ送信中なら、終わってから読む。先に読むと一覧に出ない。
const usePosts = (settings: Settings, date: string, reloadKey: number): PostsState => {
  const [posts, setPosts] = useState<PostsState>({ status: "loading" });
  // biome-ignore lint/correctness/useExhaustiveDependencies(reloadKey): 日記を保存したら読み直すためのきっかけ。中では使わない。
  useEffect(() => {
    if (!isConfigured(settings)) {
      return;
    }
    let isCancelled = false;
    waitForPost()
      .then(() => readFile(settings, journalPath(date)))
      .then((file) => {
        if (!isCancelled) {
          setPosts({ status: "ready", posts: file.kind === "found" ? extractPosts(file.content) : [] });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setPosts({ status: "error" });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [settings, date, reloadKey]);
  return posts;
};

/**
 * 今日の投稿を読み、振り返りと日記を書いて daily と journal に commit する。
 */
export const NightScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const { state } = daily;
  const existingReview = state.status === "ready" ? extractReview(state.content) : "";
  const dailyContent = state.status === "ready" ? state.content : "";
  const doneRows = getDoneScheduleRows(dailyContent);
  const checkedTurns = getCheckedTurns(dailyContent);
  const isDoneVisible = state.status === "ready" || state.status === "missing";
  const hasDone = doneRows.length > 0 || checkedTurns.length > 0;
  // 日付が変わったら App が key で作り直すので、鍵はマウント時の date のままでよい。
  const { review: reviewKey, journal: journalKey } = nightDraftKeys(date);
  const [review, setReviewDraft] = useState(() => loadDraft(reviewKey) ?? existingReview);
  const [journal, setJournal] = useState(() => loadDraft(journalKey) ?? "");
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [journalSaveCount, setJournalSaveCount] = useState(0);
  const [sentPostCount, setSentPostCount] = useState(0);
  const handlePostSent = useCallback(() => setSentPostCount((count) => count + 1), []);
  const posts = usePosts(settings, date, journalSaveCount + sentPostCount);
  // 保存の完了時に、その時点の入力と保存した内容を比べるために使う。
  const latest = useRef({ review, journal });
  latest.current = { review, journal };

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
  const canSave = (isReviewChanged || hasJournal) && save.status !== "saving" && state.status !== "loading";
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
    const savedReview = review;
    const savedJournal = journal;
    let isReviewSaved = false;
    const run = async (): Promise<void> => {
      if (shouldWriteReview) {
        const written = await updateFile(settings, dailyPath(date), message, (current) =>
          setReviewAt(setReview(current ?? createMinimalDaily(date), review), formatTokyoIso(now)),
        );
        isReviewSaved = true;
        if (remainingAfterSave(latest.current.review, savedReview) === undefined) {
          removeDraft(reviewKey);
          setHasEditedReview(false);
        }
        daily.replace(written.content, written.sha);
      }
      if (shouldWriteJournal) {
        await updateFile(settings, journalPath(date), message, (current) =>
          appendJournal(current, date, journal),
        );
        setJournalSaveCount((count) => count + 1);
        if (remainingAfterSave(latest.current.journal, savedJournal) === undefined) {
          removeDraft(journalKey);
          setJournal("");
        }
      }
    };
    const what = [shouldWriteReview ? "振り返り" : "", shouldWriteJournal ? "日記" : ""]
      .filter((name) => name !== "")
      .join("と");
    run()
      .then(() => setSave({ status: "saved", what }))
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

      <PostField
        settings={settings}
        date={date}
        isOnline={isOnline}
        onOpenSettings={onOpenSettings}
        onSent={handlePostSent}
      />

      {posts.status !== "loading" && (
        <section className="section" aria-labelledby="posts-title">
          <div className="section-head">
            <h2 id="posts-title" className="section-title">
              今日の投稿
            </h2>
            {posts.status === "ready" && posts.posts.length > 0 && (
              <span className="section-meta">{posts.posts.length} 件</span>
            )}
          </div>
          {posts.status === "error" ? (
            <p className="panel panel-empty muted">投稿を読めませんでした。</p>
          ) : posts.posts.length === 0 ? (
            <p className="panel panel-empty muted">今日の投稿はまだありません。</p>
          ) : (
            <ol className="panel posts">
              {toKeyedItems(posts.posts, (post) => `${post.time} ${post.text}`).map(({ key, item: post }) => (
                <li key={key} className="post">
                  <span className="post-time">{post.time}</span>
                  <span className="post-text">{post.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {isDoneVisible && (
        <section className="section" aria-labelledby="done-title">
          <div className="section-head">
            <h2 id="done-title" className="section-title">
              今日やったこと
            </h2>
          </div>
          {!hasDone && <p className="panel panel-empty muted">今日の記録はまだありません。</p>}
          {hasDone && (
            <ul className="panel done">
              {toKeyedItems(doneRows, (row) => `${row.time} ${row.what}`).map(({ key, item: row }) => (
                <li key={key} className="done-item">
                  <span className="done-time">{row.time}</span>
                  <span className="done-text">
                    {row.what}
                    <span className="done-actual">{row.actual}</span>
                  </span>
                </li>
              ))}
              {toKeyedItems(checkedTurns, (turn) => turn.label).map(({ key, item: turn }) => (
                <li key={`turn-${key}`} className="done-item">
                  <span className="done-time">✓</span>
                  <span className="done-text">{turn.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
            readOnly={save.status === "saving"}
            rows={6}
            value={review}
            placeholder="上のやったことを見て、できたこと・明日に回すこと"
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
            readOnly={save.status === "saving"}
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
