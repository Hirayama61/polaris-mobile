import { type FormEvent, useEffect, useState } from "react";
import { formatTokyoIso, tokyoMinutesOfDay } from "../clock";
import {
  extractSchedule,
  extractTurns,
  parseDaily,
  type ScheduleRow,
  setScheduleActual,
  setTurnChecked,
  setWakeAt,
  type TurnItem,
} from "../daily";
import { isNowInSlot, splitTaskRef, splitTurnLabel } from "../display";
import { describeFailure, type Failure } from "../failure";
import { writeKnownFile } from "../github";
import { PostField } from "../PostField";
import type { Settings } from "../settings";
import { TaskChecklist } from "../TaskChecklist";
import { taskPathOf } from "../tasks";
import { StateCard } from "../ui";
import { dailyPath, type useDaily } from "../useDaily";
import { useProjectNames } from "../useProjectNames";
import { FailureAction, UnconfiguredCard } from "./common";

type Props = {
  settings: Settings;
  date: string;
  daily: ReturnType<typeof useDaily>;
  isOnline: boolean;
  onOpenSettings: () => void;
};

type WriteTarget =
  | { kind: "turn"; line: number; nextChecked: boolean }
  | { kind: "wake" }
  | { kind: "actual"; slot: string };

// 失敗はその操作をした節の下に出す。
type WriteArea = "turns" | "wake" | "schedule";

// 同じ daily への書き込みは 1 つずつにする。
type WriteState =
  | { status: "idle" }
  | { status: "writing"; target: WriteTarget }
  | { status: "error"; area: WriteArea; failure: Failure };

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

const clockOf = (iso: string | undefined): string | undefined =>
  iso === undefined ? undefined : /T(\d{2}:\d{2})/.exec(iso)?.[1];

// 起床の記録などで frontmatter の行が増えると表の行番号がずれるので、時間枠は時刻とやることで見分ける。
const slotKey = (row: ScheduleRow): string => `${row.time}\u0000${row.what}`;

const ErrorMessage = ({ failure, onOpenSettings }: { failure: Failure; onOpenSettings: () => void }) => (
  <div className="message message-error" role="alert">
    <p>{failure.reason}</p>
    <p>{failure.hint}</p>
    {failure.action === "settings" && (
      <button type="button" className="button button-small" onClick={onOpenSettings}>
        設定を開く
      </button>
    )}
  </div>
);

/**
 * 「あなたの番」を先頭に、今日の時間割を続けて出す。チェック、起床、実績はその場で GitHub へ commit する。
 */
export const TodayScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const [write, setWrite] = useState<WriteState>({ status: "idle" });
  // 保存前と保存に失敗した実績の入力。キーは slotKey。
  const [actualDrafts, setActualDrafts] = useState<ReadonlyMap<string, string>>(new Map());
  const [openLine, setOpenLine] = useState<number | undefined>(undefined);
  const minutesOfDay = useMinutesOfDay();
  const { state } = daily;
  const taskIds =
    state.status === "ready"
      ? extractTurns(state.content).flatMap(({ label }) => splitTurnLabel(label).taskId ?? [])
      : [];
  const projectNames = useProjectNames(settings, taskIds);

  // 4:00 をまたいだら、前日の時間割で持っている実績の入力を当日の daily に書かない。
  // effect で消すと、日付が変わった直後の 1 回の描画で前日の入力が残るので、描画中に捨てる。
  const [draftsDate, setDraftsDate] = useState(date);
  const hasDateChanged = draftsDate !== date;
  if (hasDateChanged) {
    setDraftsDate(date);
    setActualDrafts(new Map());
  }

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
      <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
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
            <FailureAction failure={state.failure} onRetry={daily.reload} onOpenSettings={onOpenSettings} />
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
  const isWriting = write.status === "writing";
  const writingTarget = write.status === "writing" ? write.target : undefined;
  const checkedOf = (turn: TurnItem): boolean =>
    writingTarget?.kind === "turn" && writingTarget.line === turn.line
      ? writingTarget.nextChecked
      : turn.isChecked;
  const remaining = view.turns.filter((turn) => !checkedOf(turn)).length;
  const wakeClock = clockOf(view.wakeAt);

  const runWrite = (
    target: WriteTarget,
    area: WriteArea,
    what: string,
    transform: (current: string) => string,
    onWritten?: () => void,
  ): void => {
    if (isWriting) {
      return;
    }
    if (!isOnline) {
      setWrite({ status: "error", area, failure: OFFLINE_FAILURE });
      return;
    }
    setWrite({ status: "writing", target });
    writeKnownFile(
      settings,
      dailyPath(date),
      `chore(mobile): ${date} の${what}`,
      { content: state.content, sha: state.sha },
      transform,
    )
      .then((written) => {
        daily.replace(written.content, written.sha);
        onWritten?.();
        setWrite({ status: "idle" });
      })
      .catch((error: unknown) => {
        setWrite({ status: "error", area, failure: describeFailure(error) });
      });
  };

  const handleToggle = (turn: TurnItem): void => {
    const nextChecked = !turn.isChecked;
    // 再試行時はリモートの最新内容に当てるので、行番号ではなくラベルで探し直す。
    runWrite({ kind: "turn", line: turn.line, nextChecked }, "turns", "チェック", (current) => {
      const target = extractTurns(current).find((candidate) => candidate.label === turn.label);
      return target === undefined ? current : setTurnChecked(current, target.line, nextChecked);
    });
  };

  const handleWake = (): void => {
    const wakeAt = formatTokyoIso(new Date());
    runWrite({ kind: "wake" }, "wake", "起床", (current) => setWakeAt(current, wakeAt));
  };

  const saveActual = (row: ScheduleRow): void => {
    const slot = slotKey(row);
    const value = actualDrafts.get(slot);
    if (value === undefined || value.trim() === (row.actual ?? "")) {
      return;
    }
    // 再試行時はリモートの最新内容に当てるので、行番号ではなく時間枠で探し直す。
    runWrite(
      { kind: "actual", slot },
      "schedule",
      "実績",
      (current) => {
        const target = extractSchedule(current).find((candidate) => slotKey(candidate) === slot);
        return target === undefined ? current : setScheduleActual(current, target.line, value);
      },
      () =>
        setActualDrafts((drafts) => {
          // 保存中に書き換えた分は残す。
          if (drafts.get(slot) !== value) {
            return drafts;
          }
          const next = new Map(drafts);
          next.delete(slot);
          return next;
        }),
    );
  };

  const errorIn = (area: WriteArea) =>
    write.status === "error" && write.area === area ? (
      <ErrorMessage failure={write.failure} onOpenSettings={onOpenSettings} />
    ) : undefined;

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

      <section className="section" aria-label="起床">
        <div className="panel wake">
          {wakeClock === undefined ? (
            <>
              <span className="wake-text muted">起きたら押してください</span>
              <button
                type="button"
                className="button button-small wake-action"
                disabled={isWriting}
                onClick={handleWake}
              >
                {writingTarget?.kind === "wake" ? "保存中" : "起きた"}
              </button>
            </>
          ) : (
            <span className="wake-text">
              <span className="wake-time">{wakeClock}</span> に起床
            </span>
          )}
        </div>
        {errorIn("wake")}
      </section>

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
              const isTurnWriting = writingTarget?.kind === "turn" && writingTarget.line === turn.line;
              const { title, steps, minutes, taskId } = splitTurnLabel(turn.label);
              const projectName = taskId === undefined ? undefined : projectNames.get(taskId);
              const taskPath = taskPathOf(taskId);
              const project = projectName !== undefined && (
                <span className="turn-project">{projectName}</span>
              );
              const checkboxId = `turn-box-${turn.line}`;
              const checkbox = (
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="turn-box"
                  checked={isChecked}
                  disabled={isWriting}
                  onChange={() => handleToggle(turn)}
                />
              );
              const status = isTurnWriting && <span className="turn-status">保存中</span>;
              const rowClass = isChecked ? "turn turn-checked" : "turn";
              if (steps === undefined && taskPath === undefined) {
                return (
                  <li key={turn.line}>
                    <label className={rowClass} htmlFor={checkboxId}>
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
                    <label className="turn-check" htmlFor={checkboxId} aria-label={title}>
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
                        <span className={steps === undefined ? "turn-label" : "turn-label turn-line"}>
                          {title}
                        </span>
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
        {errorIn("turns")}
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
            {view.schedule.map((row) => {
              const isNow = isNowInSlot(row.time, minutesOfDay);
              const { text, taskId } = splitTaskRef(row.what);
              const classes = ["slot", isMine(row.who) ? "slot-mine" : "", isNow ? "slot-now" : ""]
                .filter((name) => name !== "")
                .join(" ");
              return (
                <li key={row.line} className={classes} aria-current={isNow ? "time" : undefined}>
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
                    {row.actual !== undefined && (
                      <form
                        className="slot-actual"
                        onSubmit={(event: FormEvent) => {
                          event.preventDefault();
                          saveActual(row);
                        }}
                      >
                        <input
                          type="text"
                          className="input input-actual"
                          aria-label={`${row.time} の実績`}
                          enterKeyHint="done"
                          placeholder="実績"
                          readOnly={isWriting}
                          value={actualDrafts.get(slotKey(row)) ?? row.actual}
                          onChange={(event) => {
                            const value = event.target.value;
                            setActualDrafts((drafts) => new Map(drafts).set(slotKey(row), value));
                          }}
                          onBlur={() => saveActual(row)}
                        />
                        {writingTarget?.kind === "actual" && writingTarget.slot === slotKey(row) && (
                          <span className="slot-actual-status">保存中</span>
                        )}
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {errorIn("schedule")}
      </section>
    </>
  );
};
