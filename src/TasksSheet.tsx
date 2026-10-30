import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatTokyoIso } from "./clock";
import { describeFailure, type Failure } from "./failure";
import { isConflict, listFileNames, readFile, writeIfUnchanged } from "./github";
import { addDoubt, extractSection, parseDoubts } from "./questions";
import type { Settings } from "./settings";
import { completeTask, extractChecklist, loadHumanTasks, setChecklistItem, type HumanTask } from "./tasks";
import { CloseIcon } from "./ui";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; tasks: HumanTask[] }
  | { status: "error"; failure: Failure };

type FileState =
  | { status: "loading" }
  | { status: "ready"; content: string; sha: string }
  | { status: "missing" }
  | { status: "error"; failure: Failure };

type WriteState =
  | { status: "idle" }
  | { status: "writing"; line: number | "complete" | "doubt" }
  | { status: "conflict" }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  onClose: () => void;
  onOpenSettings: () => void;
};

const taskPath = (id: string): string => `tasks/${id}.md`;

type FailureMessageProps = {
  failure: Failure;
  onRetry: () => void;
  onOpenSettings: () => void;
};

const FailureMessage = ({ failure, onRetry, onOpenSettings }: FailureMessageProps) => (
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

const Skeleton = () => (
  <div className="skeleton" aria-busy="true" aria-label="読み込み中">
    <div className="skeleton-line" />
    <div className="skeleton-line" />
    <div className="skeleton-line skeleton-short" />
  </div>
);

type DetailProps = {
  settings: Settings;
  task: HumanTask;
  onCompleted: () => void;
  onOpenSettings: () => void;
};

const TaskDetail = ({ settings, task, onCompleted, onOpenSettings }: DetailProps) => {
  const [file, setFile] = useState<FileState>({ status: "loading" });
  const [write, setWrite] = useState<WriteState>({ status: "idle" });
  const [doubt, setDoubt] = useState("");

  const fetchFile = useCallback(() => {
    setFile({ status: "loading" });
    let isCancelled = false;
    readFile(settings, taskPath(task.id))
      .then((result) => {
        if (!isCancelled) {
          setFile(
            result.kind === "found"
              ? { status: "ready", content: result.content, sha: result.sha }
              : { status: "missing" },
          );
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setFile({ status: "error", failure: describeFailure(error) });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [settings, task.id]);

  useEffect(() => fetchFile(), [fetchFile]);

  if (file.status === "loading") {
    return <Skeleton />;
  }
  if (file.status === "error") {
    return <FailureMessage failure={file.failure} onRetry={fetchFile} onOpenSettings={onOpenSettings} />;
  }
  if (file.status === "missing") {
    return <p className="panel panel-empty muted">このタスクのファイルが見つかりません。</p>;
  }

  const items = extractChecklist(file.content);
  const isWriting = write.status === "writing";
  const canComplete = items.length > 0 && items.every((item) => item.isChecked);
  const doubts = parseDoubts(extractSection(file.content, "疑問点") ?? "");
  const findings = extractSection(file.content, "調べたこと") ?? "";

  // 別の場所で変わっていたら上書きせず、読み直してもう一度操作してもらう。
  const save = (line: number | "complete" | "doubt", next: string, message: string, onSaved: (sha: string) => void): void => {
    if (isWriting || next === file.content) {
      return;
    }
    setWrite({ status: "writing", line });
    writeIfUnchanged(settings, taskPath(task.id), message, file.sha, next)
      .then(({ sha }) => {
        setWrite({ status: "idle" });
        onSaved(sha);
      })
      .catch((error: unknown) => {
        if (isConflict(error)) {
          setWrite({ status: "conflict" });
          fetchFile();
        } else {
          setWrite({ status: "error", failure: describeFailure(error) });
        }
      });
  };

  const handleToggle = (line: number, isChecked: boolean): void => {
    const next = setChecklistItem(file.content, line, !isChecked);
    save(line, next, `chore(mobile): ${task.id} のチェック`, (sha) =>
      setFile({ status: "ready", content: next, sha }),
    );
  };

  const handleComplete = (): void => {
    const next = completeTask(file.content, formatTokyoIso(new Date()));
    save("complete", next, `chore(mobile): ${task.id} を完了にする`, onCompleted);
  };

  const handleAddDoubt = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const next = addDoubt(file.content, doubt);
    save("doubt", next, `chore(mobile): ${task.id} に疑問点を足す`, (sha) => {
      setFile({ status: "ready", content: next, sha });
      setDoubt("");
    });
  };

  return (
    <>
      {items.length === 0 ? (
        <p className="panel panel-empty muted">「あなたがやること」のチェックリストがありません。</p>
      ) : (
        <ul className="panel turns">
          {items.map((item) => (
            <li key={item.line}>
              <label className={item.isChecked ? "turn turn-checked" : "turn"}>
                <input
                  type="checkbox"
                  className="turn-box"
                  checked={item.isChecked}
                  disabled={isWriting}
                  onChange={() => handleToggle(item.line, item.isChecked)}
                />
                <span className="turn-text">
                  <span className="turn-label">{item.label}</span>
                </span>
                {write.status === "writing" && write.line === item.line && (
                  <span className="turn-status">保存中</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      {write.status === "conflict" && (
        <div className="message message-error" role="alert">
          <p>別の場所で変更されていたので、保存せずに読み直しました。</p>
          <p>内容を確かめて、もう一度操作してください。</p>
        </div>
      )}
      {write.status === "error" && (
        <FailureMessage
          failure={write.failure}
          onRetry={() => setWrite({ status: "idle" })}
          onOpenSettings={onOpenSettings}
        />
      )}
      <section className="field">
        <h3 id="task-doubt-title" className="field-label question-heading">
          疑問点
        </h3>
        {doubts.length > 0 && (
          <ul className="panel doubt-list">
            {doubts.map((item, index) => (
              <li key={index} className={item.status === "done" ? "doubt-row doubt-done" : "doubt-row"}>
                <span className="doubt-text">{item.text}</span>
                {item.status !== "other" && (
                  <span className={item.status === "done" ? "doubt-status" : "doubt-status doubt-open"}>
                    {item.status === "done" ? "調べ済み" : "未回答"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="input-with-action" onSubmit={handleAddDoubt}>
          <input
            type="text"
            className="input"
            aria-labelledby="task-doubt-title"
            enterKeyHint="send"
            readOnly={isWriting}
            value={doubt}
            placeholder="分からないことをひとこと"
            onChange={(event) => setDoubt(event.target.value)}
          />
          <button type="submit" className="input-action" disabled={isWriting || doubt.trim() === ""}>
            {write.status === "writing" && write.line === "doubt" ? "保存中" : "足す"}
          </button>
        </form>
      </section>
      {findings !== "" && (
        <section className="field">
          <h3 className="field-label question-heading">調べたこと</h3>
          <p className="panel question-text">{findings}</p>
        </section>
      )}
      {canComplete && (
        <button type="button" className="button button-primary button-block" disabled={isWriting} onClick={handleComplete}>
          {write.status === "writing" && write.line === "complete" ? "保存中" : "完了にする"}
        </button>
      )}
      <p className="turn-task">{task.id}</p>
    </>
  );
};

/**
 * `tasks/*.md` の人の todo を一覧にし、タップで「## あなたがやること」をチェックできるシート。
 */
export const TasksSheet = ({ settings, onClose, onOpenSettings }: Props) => {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<HumanTask | undefined>(undefined);

  const fetchTasks = useCallback(() => {
    if (settings.token === "") {
      return undefined;
    }
    setLoad({ status: "loading" });
    let isCancelled = false;
    loadHumanTasks(
      (path) => listFileNames(settings, path),
      async (path) => {
        const file = await readFile(settings, path);
        return file.kind === "found" ? file.content : undefined;
      },
    )
      .then((tasks) => {
        if (!isCancelled) {
          setLoad({ status: "ready", tasks });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setLoad({ status: "error", failure: describeFailure(error) });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [settings]);

  useEffect(() => fetchTasks(), [fetchTasks]);

  useEffect(() => {
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

  const handleCompleted = (id: string): void => {
    setSelected(undefined);
    setLoad((current) =>
      current.status === "ready" ? { status: "ready", tasks: current.tasks.filter((task) => task.id !== id) } : current,
    );
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tasks-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          {selected !== undefined && (
            <button
              type="button"
              className="icon-button sheet-back"
              aria-label="一覧に戻る"
              onClick={() => setSelected(undefined)}
            >
              <span className="back-chevron" aria-hidden="true" />
            </button>
          )}
          <h2 id="tasks-title" className="sheet-title">
            {selected === undefined ? "あなたのタスク" : selected.title}
          </h2>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {selected !== undefined ? (
          <TaskDetail
            key={selected.id}
            settings={settings}
            task={selected}
            onCompleted={() => handleCompleted(selected.id)}
            onOpenSettings={onOpenSettings}
          />
        ) : settings.token === "" ? (
          <div className="message message-error" role="alert">
            <p>トークンが未設定です。</p>
            <button type="button" className="button button-small" onClick={onOpenSettings}>
              設定を開く
            </button>
          </div>
        ) : load.status === "loading" ? (
          <Skeleton />
        ) : load.status === "error" ? (
          <FailureMessage failure={load.failure} onRetry={fetchTasks} onOpenSettings={onOpenSettings} />
        ) : load.tasks.length === 0 ? (
          <p className="panel panel-empty muted">いまあなたのタスクはありません。</p>
        ) : (
          <ul className="panel project-list">
            {load.tasks.map((task) => (
              <li key={task.id}>
                <button type="button" className="project-row" onClick={() => setSelected(task)}>
                  <span className="turn-text">
                    <span className="turn-line">{task.title}</span>
                    {task.projectName !== undefined && <span className="turn-project">{task.projectName}</span>}
                  </span>
                  <span className="project-chevron" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
