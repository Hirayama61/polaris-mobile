import { useEffect, useState } from "react";
import { tokyoMinutesOfDay } from "../clock";
import { extractTurns, parseDaily, setTurnChecked, type TurnItem } from "../daily";
import { isNowInSlot, splitTaskRef, splitTurnLabel } from "../display";
import { describeFailure, type Failure } from "../failure";
import { writeKnownFile } from "../github";
import { PostField } from "../PostField";
import type { Settings } from "../settings";
import { useProjectNames } from "../useProjectNames";
import { TaskChecklist } from "../TaskChecklist";
import { taskPathOf } from "../tasks";
import { StateCard } from "../ui";
import { dailyPath, useDaily } from "../useDaily";
import { FailureAction, UnconfiguredCard } from "./common";

type Props = {
  settings: Settings;
  date: string;
  daily: ReturnType<typeof useDaily>;
  isOnline: boolean;
  onOpenSettings: () => void;
};

type WriteState =
  | { status: "idle" }
  | { status: "writing"; line: number; nextChecked: boolean }
  | { status: "error"; failure: Failure };

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため保存できません。",
  hint: "つながったらもう一度タップしてください。",
  action: "retry",
};

// 「いま」の印を分単位で動かす。
const useMinutesOfDay = (): number => {
  const [minutes, setMinutes] = useState(() => tokyoMinutesOfDay(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(tokyoMinutesOfDay(new Date())), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes;
};

const isMine = (who: string): boolean => who === "あなた";

/**
 * 「あなたの番」を先頭に、今日の時間割を続けて出す。チェックはその場で GitHub へ commit する。
 */
export const TodayScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const [write, setWrite] = useState<WriteState>({ status: "idle" });
  const [openLine, setOpenLine] = useState<number | undefined>(undefined);
  const minutesOfDay = useMinutesOfDay();
  const { state } = daily;
  const taskIds =
    state.status === "ready"
      ? extractTurns(state.content).flatMap(({ label }) => splitTurnLabel(label).taskId ?? [])
      : [];
  const projectNames = useProjectNames(settings, taskIds);

  // オフラインで出した失敗は、つながったら消す。
  useEffect(() => {
    if (isOnline) {
      setWrite((current) =>
        current.status === "error" && current.failure === OFFLINE_FAILURE ? { status: "idle" } : current,
      );
    }
  }, [isOnline]);

  if (state.status === "unconfigured") {
    return <UnconfiguredCard onOpenSettings={onOpenSettings} />;
  }
  if (state.status === "loading") {
    return (
      <div className="skeleton" aria-busy="true" aria-label="読み込み中">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-short" />
      </div>
    );
  }
  const postField = (
    <PostField
      key={date}
      settings={settings}
      date={date}
      isOnline={isOnline}
      onOpenSettings={onOpenSettings}
    />
  );
  if (state.status === "error") {
    return (
      <>
        <StateCard
          title="今日の計画を読めませんでした"
          tone="error"
          action={
            <FailureAction
              failure={state.failure}
              onRetry={daily.reload}
              onOpenSettings={onOpenSettings}
            />
          }
        >
          <p>{state.failure.reason}</p>
          <p className="muted">{state.failure.hint}</p>
        </StateCard>
        {postField}
      </>
    );
  }
  if (state.status === "missing") {
    return (
      <>
        <StateCard
          title="今日の計画はまだありません"
          action={
            <button type="button" className="button" onClick={daily.reload}>
              読み直す
            </button>
          }
        >
          <p className="muted">毎朝 6:00 に朝ジョブが作ります。夜の振り返りは今日も書けます。</p>
        </StateCard>
        {postField}
      </>
    );
  }

  const view = parseDaily(state.content);
  const checkedOf = (turn: TurnItem): boolean =>
    write.status === "writing" && write.line === turn.line ? write.nextChecked : turn.isChecked;
  const remaining = view.turns.filter((turn) => !checkedOf(turn)).length;

  const handleToggle = (turn: TurnItem): void => {
    if (write.status === "writing") {
      return;
    }
    if (!isOnline) {
      setWrite({ status: "error", failure: OFFLINE_FAILURE });
      return;
    }
    const nextChecked = !turn.isChecked;
    setWrite({ status: "writing", line: turn.line, nextChecked });
    writeKnownFile(
      settings,
      dailyPath(date),
      `chore(mobile): ${date} のチェック`,
      { content: state.content, sha: state.sha },
      // 再試行時はリモートの最新内容に当てるので、行番号ではなくラベルで探し直す。
      (current) => {
        const target = extractTurns(current).find((candidate) => candidate.label === turn.label);
        return target === undefined ? current : setTurnChecked(current, target.line, nextChecked);
      },
    )
      .then((written) => {
        daily.replace(written.content, written.sha);
        setWrite({ status: "idle" });
      })
      .catch((error: unknown) => {
        setWrite({ status: "error", failure: describeFailure(error) });
      });
  };

  return (
    <>
      {state.freshness.kind === "stale" && (
        <div className="banner">
          <p>
            {state.freshness.failure.reason}
            前回読んだ内容を出しています。
          </p>
          <button type="button" className="button button-small" onClick={daily.reload}>
            読み直す
          </button>
        </div>
      )}

      <section className="section" aria-labelledby="turns-title">
        <div className="section-head">
          <h2 id="turns-title" className="section-title">
            あなたの番
          </h2>
          {view.turns.length > 0 && (
            <span className="section-meta">{remaining === 0 ? "完了" : `残り ${remaining}`}</span>
          )}
        </div>
        {view.turns.length === 0 ? (
          <p className="panel panel-empty muted">今日はありません。</p>
        ) : (
          <ul className="panel turns">
            {view.turns.map((turn) => {
              const isChecked = checkedOf(turn);
              const isWriting = write.status === "writing" && write.line === turn.line;
              const { title, steps, minutes, taskId } = splitTurnLabel(turn.label);
              const projectName = taskId === undefined ? undefined : projectNames.get(taskId);
              const taskPath = taskPathOf(taskId);
              const project = projectName !== undefined && (
                <span className="turn-project">{projectName}</span>
              );
              const checkbox = (
                <input
                  type="checkbox"
                  className="turn-box"
                  checked={isChecked}
                  disabled={write.status === "writing"}
                  onChange={() => handleToggle(turn)}
                />
              );
              const status = isWriting && <span className="turn-status">保存中</span>;
              const rowClass = isChecked ? "turn turn-checked" : "turn";
              if (steps === undefined && taskPath === undefined) {
                return (
                  <li key={turn.line}>
                    <label className={rowClass}>
                      {checkbox}
                      <span className="turn-text">
                        <span className="turn-label">{title}</span>
                        {project}
                        {taskId !== undefined && <span className="turn-task">{taskId}</span>}
                      </span>
                      {status}
                    </label>
                  </li>
                );
              }
              const isOpen = openLine === turn.line;
              const detailId = `turn-detail-${turn.line}`;
              return (
                <li key={turn.line}>
                  <div className={`${rowClass} turn-split`}>
                    <label className="turn-check" aria-label={title}>
                      {checkbox}
                    </label>
                    <button
                      type="button"
                      className="turn-toggle"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() => setOpenLine(isOpen ? undefined : turn.line)}
                    >
                      <span className="turn-text">
                        {/* 手順の無い行は詳細に本文が出ないので、タイトルを省略せず折り返す。 */}
                        <span className={steps === undefined ? "turn-label" : "turn-label turn-line"}>{title}</span>
                        {project}
                      </span>
                      {minutes !== undefined && <span className="turn-minutes">{minutes}</span>}
                      {status}
                      <span className="turn-chevron" aria-hidden="true" />
                    </button>
                  </div>
                  {isOpen && (
                    <div id={detailId} className="turn-detail">
                      {steps !== undefined && <p className="turn-steps">{steps}</p>}
                      {taskId !== undefined && taskPath !== undefined && (
                        <TaskChecklist
                          settings={settings}
                          taskId={taskId}
                          path={taskPath}
                          onOpenSettings={onOpenSettings}
                        />
                      )}
                      {taskId !== undefined && <span className="turn-task">{taskId}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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
      </section>

      {postField}

      <section className="section" aria-labelledby="schedule-title">
        <div className="section-head">
          <h2 id="schedule-title" className="section-title">
            時間割
          </h2>
        </div>
        {view.schedule.length === 0 ? (
          <p className="panel panel-empty muted">時間割はありません。</p>
        ) : (
          <ol className="panel timeline">
            {view.schedule.map((row, index) => {
              const isNow = isNowInSlot(row.time, minutesOfDay);
              const { text, taskId } = splitTaskRef(row.what);
              const classes = ["slot", isMine(row.who) ? "slot-mine" : "", isNow ? "slot-now" : ""]
                .filter((name) => name !== "")
                .join(" ");
              return (
                <li key={index} className={classes} aria-current={isNow ? "time" : undefined}>
                  <span className="slot-time">{row.time}</span>
                  <span className="slot-body">
                    <span className="slot-what">{text}</span>
                    <span className="slot-meta">
                      {isNow && <span className="tag tag-now">いま</span>}
                      {row.who !== "" && (
                        <span className={isMine(row.who) ? "tag tag-mine" : "tag"}>{row.who}</span>
                      )}
                      {taskId !== undefined && <span className="slot-task">{taskId}</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
};
