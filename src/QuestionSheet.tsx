import { useCallback, useEffect, useRef, useState } from "react";
import { describeFailure, type Failure } from "./failure";
import { isConflict, listFileNames, readFile, readText, writeIfUnchanged } from "./github";
import { IssueLink } from "./IssueLink";
import { getIssueLink, linkifyText } from "./linkify";
import { readFrontmatterValue } from "./projects";
import { collectOpenQuestions, extractSection, type QuestionItem, replaceAnswer } from "./questions";
import { SegmentsView } from "./SegmentView";
import type { Settings } from "./settings";
import { type BackTo, CloseIcon } from "./ui";

type ListState =
  | { status: "loading" }
  | { status: "ready"; items: QuestionItem[] }
  | { status: "error"; failure: Failure };

type DetailState =
  | { status: "loading" }
  | { status: "ready"; content: string; sha: string }
  | { status: "missing" }
  | { status: "error"; failure: Failure };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; path: string }
  | { status: "conflict" }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  isOnline: boolean;
  /** 受信箱でタップした質問。詳細から開き、一覧は「一覧に戻る」で読む。 */
  initialQuestion: QuestionItem;
  /** 詳細の戻るボタンの文言と行き先。呼び出し側が決める。無ければシートの中の一覧に戻る。 */
  backTo?: BackTo;
  onClose: () => void;
  onOpenSettings: () => void;
};

const CHOICES = ["A", "B", "C"] as const;

const taskPath = (id: string): string => `tasks/${id}.md`;

const ErrorMessage = ({
  failure,
  onRetry,
  onOpenSettings,
}: {
  failure: Failure;
  onRetry: () => void;
  onOpenSettings: () => void;
}) => (
  <div className="message message-error" role="alert">
    <p>{failure.reason}</p>
    <p>{failure.hint}</p>
    {failure.action === "settings" ? (
      <button type="button" className="button button-small" onClick={onOpenSettings}>
        設定を開く
      </button>
    ) : (
      <button type="button" className="button button-small" onClick={onRetry}>
        読み直す
      </button>
    )}
  </div>
);

/**
 * 質問タスクの一覧と、「## 回答」を書くシート。
 *
 * 保存は読んだときの sha で書き、競合したら上書きせず読み直しを促す。
 * 保存できたら一覧に戻して読み直す。失敗したときは書いた回答を残すため詳細に留める。
 * 保存中だけは閉じさせない。閉じると保存の結果を見ずに同じ回答を書き直せてしまうため。
 */
export const QuestionSheet = ({
  settings,
  isOnline,
  initialQuestion,
  backTo,
  onClose,
  onOpenSettings,
}: Props) => {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selected, setSelected] = useState<QuestionItem | undefined>(initialQuestion);
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [answer, setAnswer] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const isSaving = save.status === "saving";
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;
  // 一覧と詳細の読み込みが前後したとき、古い結果で上書きしないための番号。
  const requestRef = useRef(0);
  // 既存の回答を回答欄に入れたか。初回の読み込みが落ちたあとの再試行では入れる必要がある。
  const answerLoadedRef = useRef(false);

  const close = (): void => {
    if (!isSaving) {
      onClose();
    }
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isSavingRef.current) {
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

  // 一覧が出ていれば、読み込み中に戻さず裏で更新する。更新に失敗しても出ている一覧を残す。
  const loadList = useCallback((): void => {
    const request = ++requestRef.current;
    setList((current) => (current.status === "ready" ? current : { status: "loading" }));
    listFileNames(settings, "tasks")
      .then((names) => collectOpenQuestions(names, (id) => readText(settings, taskPath(id))))
      .then((items) => {
        if (request === requestRef.current) {
          setList({ status: "ready", items });
        }
      })
      .catch((error: unknown) => {
        if (request === requestRef.current) {
          setList((current) =>
            current.status === "ready" ? current : { status: "error", failure: describeFailure(error) },
          );
        }
      });
  }, [settings]);

  // 書きかけの回答は残したまま、ファイルだけを読み直す。
  const loadDetail = useCallback(
    (item: QuestionItem, fillAnswer: boolean): void => {
      const request = ++requestRef.current;
      setDetail({ status: "loading" });
      readFile(settings, taskPath(item.id))
        .then((file) => {
          if (request !== requestRef.current) {
            return;
          }
          if (file.kind === "missing") {
            setDetail({ status: "missing" });
            return;
          }
          setDetail({ status: "ready", content: file.content, sha: file.sha });
          if (fillAnswer) {
            setAnswer(extractSection(file.content, "回答") ?? "");
            answerLoadedRef.current = true;
          }
        })
        .catch((error: unknown) => {
          if (request === requestRef.current) {
            setDetail({ status: "error", failure: describeFailure(error) });
          }
        });
    },
    [settings],
  );

  // 一覧と詳細は同じ番号で前後を見るので、開いたときは詳細だけを読む。
  useEffect(() => {
    loadDetail(initialQuestion, true);
  }, [initialQuestion, loadDetail]);

  const open = (item: QuestionItem): void => {
    setSelected(item);
    setAnswer("");
    answerLoadedRef.current = false;
    setSave({ status: "idle" });
    loadDetail(item, true);
  };

  const backLabel = backTo?.label ?? "一覧に戻る";

  const back = (): void => {
    if (isSaving) {
      return;
    }
    if (backTo !== undefined) {
      backTo.onBack();
      return;
    }
    setSelected(undefined);
    setSave({ status: "idle" });
    loadList();
  };

  const reload = (): void => {
    if (selected !== undefined) {
      setSave({ status: "idle" });
      loadDetail(selected, !answerLoadedRef.current);
    }
  };

  const updateAnswer = (next: string): void => {
    setAnswer(next);
    if (save.status === "error") {
      setSave({ status: "idle" });
    }
  };

  const canSave = selected !== undefined && detail.status === "ready" && answer.trim() !== "" && !isSaving;

  const handleSave = (): void => {
    if (!canSave || selected === undefined || detail.status !== "ready") {
      return;
    }
    if (!isOnline) {
      setSave({
        status: "error",
        failure: {
          reason: "オフラインのため保存できません。",
          hint: "書いた回答は残っています。つながったら保存してください。",
          action: "retry",
        },
      });
      return;
    }
    setSave({ status: "saving" });
    const content = replaceAnswer(detail.content, answer);
    writeIfUnchanged(
      settings,
      taskPath(selected.id),
      `chore(mobile): ${selected.id} に回答`,
      detail.sha,
      content,
    )
      .then(() => {
        setSelected(undefined);
        setSave({ status: "saved", path: taskPath(selected.id) });
        loadList();
      })
      .catch((error: unknown) => {
        setSave(
          isConflict(error) ? { status: "conflict" } : { status: "error", failure: describeFailure(error) },
        );
      });
  };

  const question = detail.status === "ready" ? extractSection(detail.content, "質問") : undefined;
  const choices = detail.status === "ready" ? extractSection(detail.content, "選択肢") : undefined;
  const issueLink =
    detail.status === "ready" ? getIssueLink(readFrontmatterValue(detail.content, "issue")) : undefined;
  const hasQuestion = question !== undefined && question !== "";
  const hasChoices = choices !== undefined && choices !== "";

  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-scrim" aria-hidden="true" tabIndex={-1} onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="question-sheet-title">
        <div className="sheet-head">
          <h2 id="question-sheet-title" className="sheet-title">
            {selected === undefined ? "質問に答える" : selected.title}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="閉じる"
            disabled={isSaving}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>

        {selected === undefined ? (
          <>
            {save.status === "saved" && (
              <p className="message message-ok" role="status">
                {save.path} の「回答」に書きました。
              </p>
            )}
            {list.status === "loading" && (
              <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-short" />
              </div>
            )}
            {list.status === "error" && (
              <ErrorMessage failure={list.failure} onRetry={loadList} onOpenSettings={onOpenSettings} />
            )}
            {list.status === "ready" &&
              (list.items.length === 0 ? (
                <p className="panel panel-empty muted">答える質問はありません。</p>
              ) : (
                <ul className="panel questions">
                  {list.items.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="question-item" onClick={() => open(item)}>
                        <span className="turn-text">
                          <span className="turn-label">{item.title}</span>
                          <span className="turn-task">{item.id}</span>
                        </span>
                        {item.answered && <span className="tag question-answered">回答済み</span>}
                        <span className="question-chevron" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        ) : (
          <>
            <button
              type="button"
              className="button button-small question-back"
              disabled={isSaving}
              onClick={back}
            >
              {backLabel}
            </button>

            {detail.status === "loading" && (
              <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-short" />
              </div>
            )}
            {detail.status === "missing" && (
              <p className="panel panel-empty muted">このタスクは見つかりません。一覧に戻ってください。</p>
            )}
            {detail.status === "error" && (
              <ErrorMessage failure={detail.failure} onRetry={reload} onOpenSettings={onOpenSettings} />
            )}
            {detail.status === "ready" && (
              <>
                {issueLink !== undefined && <IssueLink href={issueLink.href} label={issueLink.text} />}
                <section className="field">
                  <h3 className="field-label question-heading">質問</h3>
                  <p className="panel question-text">
                    {hasQuestion ? <SegmentsView segments={linkifyText(question)} /> : "(なし)"}
                  </p>
                </section>
                {hasChoices && (
                  <section className="field">
                    <h3 className="field-label question-heading">選択肢</h3>
                    <p className="panel question-text">
                      <SegmentsView segments={linkifyText(choices)} />
                    </p>
                  </section>
                )}

                <div className="field">
                  <label className="field-label" htmlFor="question-answer">
                    回答
                  </label>
                  <div className="question-choices">
                    {CHOICES.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className="button button-small"
                        aria-pressed={answer.trim() === choice}
                        disabled={isSaving}
                        onClick={() => updateAnswer(choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="question-answer"
                    className="textarea"
                    rows={3}
                    disabled={isSaving}
                    value={answer}
                    placeholder="A / B / C か、短い文"
                    onChange={(event) => updateAnswer(event.target.value)}
                  />
                </div>

                {save.status === "conflict" && (
                  <div className="message message-error" role="alert">
                    <p>ほかの場所でこのタスクが更新されています。上書きしていません。</p>
                    <p>読み直してから、もう一度保存してください。書いた回答は残ります。</p>
                    <button type="button" className="button button-small" onClick={reload}>
                      読み直す
                    </button>
                  </div>
                )}
                {save.status === "error" && (
                  <div className="message message-error" role="alert">
                    <p>{save.failure.reason}</p>
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
                  {isSaving ? "保存中…" : "保存"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
