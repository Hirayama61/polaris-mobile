import { useCallback, useEffect, useState } from "react";
import { describeFailure, type Failure } from "./failure";
import { isConflict, readFile, writeIfUnchanged } from "./github";
import type { Settings } from "./settings";
import { extractChecklist, setChecklistItem } from "./tasks";

type FileState =
  | { status: "loading" }
  | { status: "ready"; content: string; sha: string }
  | { status: "missing" }
  | { status: "error"; failure: Failure };

type WriteState =
  | { status: "idle" }
  | { status: "writing"; line: number }
  | { status: "conflict" }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  taskId: string;
  path: string;
  onOpenSettings: () => void;
};

/**
 * 「あなたの番」の項目の下に `tasks/<id>.md` の「## あなたがやること」を出し、1 つずつチェックできるようにする。
 *
 * 書き換えるのは tasks のチェックの行だけ。daily の親の行は変えない。
 */
export const TaskChecklist = ({ settings, taskId, path, onOpenSettings }: Props) => {
  const [file, setFile] = useState<FileState>({ status: "loading" });
  const [write, setWrite] = useState<WriteState>({ status: "idle" });

  const fetchFile = useCallback(() => {
    setFile({ status: "loading" });
    let isCancelled = false;
    readFile(settings, path)
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
  }, [settings, path]);

  useEffect(() => fetchFile(), [fetchFile]);

  if (file.status === "loading") {
    return <p className="subtasks-note muted">チェックリストを読んでいます</p>;
  }
  if (file.status === "error") {
    return (
      <div className="message message-error" role="alert">
        <p>{file.failure.reason}</p>
        <p>{file.failure.hint}</p>
        {file.failure.action === "settings" ? (
          <button type="button" className="button button-small" onClick={onOpenSettings}>
            設定を開く
          </button>
        ) : (
          <button type="button" className="button button-small" onClick={fetchFile}>
            読み直す
          </button>
        )}
      </div>
    );
  }
  if (file.status === "missing") {
    return <p className="subtasks-note muted">このタスクのファイルが見つかりません。</p>;
  }

  const items = extractChecklist(file.content);
  if (items.length === 0) {
    return <p className="subtasks-note muted">チェックリストはありません。</p>;
  }
  const isWriting = write.status === "writing";

  // 別の場所で変わっていたら上書きせず、読み直してもう一度操作してもらう。行番号がずれていても別の行を変えない。
  const handleToggle = (line: number, isChecked: boolean): void => {
    const next = setChecklistItem(file.content, line, !isChecked);
    if (isWriting || next === file.content) {
      return;
    }
    setWrite({ status: "writing", line });
    writeIfUnchanged(settings, path, `chore(mobile): ${taskId} のチェック`, file.sha, next)
      .then(({ sha }) => {
        setWrite({ status: "idle" });
        setFile({ status: "ready", content: next, sha });
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

  return (
    <>
      <ul className="subtasks">
        {items.map((item) => (
          <li key={item.line}>
            <label className={item.isChecked ? "subtask subtask-checked" : "subtask"}>
              <input
                type="checkbox"
                className="turn-box"
                checked={item.isChecked}
                disabled={isWriting}
                onChange={() => handleToggle(item.line, item.isChecked)}
              />
              <span className="subtask-label">{item.label}</span>
              {write.status === "writing" && write.line === item.line && (
                <span className="turn-status">保存中</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      {write.status === "conflict" && (
        <div className="message message-error" role="alert">
          <p>別の場所で変更されていたので、保存せずに読み直しました。</p>
          <p>内容を確かめて、もう一度操作してください。</p>
        </div>
      )}
      {write.status === "error" && (
        <div className="message message-error" role="alert">
          <p>{write.failure.reason}</p>
          <p>{write.failure.hint}</p>
          {write.failure.action === "settings" && (
            <button type="button" className="button button-small" onClick={onOpenSettings}>
              設定を開く
            </button>
          )}
        </div>
      )}
    </>
  );
};
