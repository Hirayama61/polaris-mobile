import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import { tokyoMinutesOfDay } from "../clock";
import { extractTurns, parseDaily, type TurnItem } from "../daily";
import { canFoldSlot, getNowMarker, isNowInSlot, NO_NOW_MARKER, splitTurnLabel } from "../display";
import type { Failure } from "../failure";
import { QuestionSheet } from "../QuestionSheet";
import type { Settings } from "../settings";
import { TaskChecklist } from "../TaskChecklist";
import { taskPathOf } from "../tasks";
import { buildTimetable, type TimetableSlot } from "../timetable";
import { PenIcon, StateCard } from "../ui";
import type { useDaily } from "../useDaily";
import { useProjectNames } from "../useProjectNames";
import { FailureAction, UnconfiguredCard } from "./common";
import { AddSlotSheet, ChangeSlotSheet, type SlotTarget } from "./SlotEditSheet";
import { SlotTaskDetail } from "./SlotTaskDetail";
import { useSlotTask } from "./useSlotTask";
import { slotKey, useTodayWrite } from "./useTodayWrite";
import { isWriteAt, type WritePlace } from "./writePlace";

type Props = {
  settings: Settings;
  date: string;
  daily: ReturnType<typeof useDaily>;
  isOnline: boolean;
  onOpenSettings: () => void;
};

// 時間割のコマを足すか直すシート。同時に開くのは 1 つだけ。
type SlotSheet = { kind: "closed" } | { kind: "add" } | { kind: "change"; target: SlotTarget };

const changingTargetOf = (sheet: SlotSheet): SlotTarget | undefined => {
  const isChanging = sheet.kind === "change";
  if (!isChanging) {
    return undefined;
  }
  return sheet.target;
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

// 起床を足したコマは時刻を持たないので、現在時刻の線の対象にしない。
const NO_SLOT_TIME = "";

const getSlotTime = (slot: TimetableSlot): string => {
  const isAddedWake = slot.source === "added-wake";
  if (isAddedWake) {
    return NO_SLOT_TIME;
  }
  return slot.row.time;
};

const clockOf = (iso: string | undefined): string | undefined =>
  iso === undefined ? undefined : /T(\d{2}:\d{2})/.exec(iso)?.[1];

const joinClassNames = (names: readonly (string | false)[]): string =>
  names.filter((name): name is string => name !== false).join(" ");

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

const WAKE_DETAIL_ID = "slot-detail-wake";

/**
 * 今日の時間割だけを出す。起床のコマで起床を、`(task: ID)` のコマでやることか質問を開く。
 * チェック、起床、実績はその場で GitHub へ commit する。
 */
export const TodayScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const [openLine, setOpenLine] = useState<number | undefined>(undefined);
  const [isWakeOpen, setIsWakeOpen] = useState(false);
  // 完了して終わったコマのうち、タップで開いたもの。キーは slotKey。
  const [unfoldedSlots, setUnfoldedSlots] = useState<ReadonlySet<string>>(new Set());
  const [slotSheet, setSlotSheet] = useState<SlotSheet>({ kind: "closed" });
  const closeSlotSheet = useCallback(() => setSlotSheet({ kind: "closed" }), []);
  const slotTask = useSlotTask(settings);
  // 4:00 をまたいだら、前日の時間割で開いていたものを閉じる。前日の実績の入力は hook が捨てる。
  const {
    write,
    isWriting,
    writingTarget,
    actualDrafts,
    setActualDraft,
    handleToggle,
    handleWake,
    saveActual,
  } = useTodayWrite(settings, date, isOnline, daily, () => {
    setIsWakeOpen(false);
    setUnfoldedSlots(new Set());
    setSlotSheet({ kind: "closed" });
    slotTask.close();
  });
  const minutesOfDay = useMinutesOfDay();
  const { state } = daily;
  const taskIds =
    state.status === "ready"
      ? extractTurns(state.content).flatMap(({ label }) => splitTurnLabel(label).taskId ?? [])
      : [];
  const projectNames = useProjectNames(settings, taskIds);

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
  if (state.status === "error") {
    return (
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
    );
  }
  if (state.status === "missing") {
    return (
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
    );
  }

  const view = parseDaily(state.content);
  const checkedOf = (turn: TurnItem): boolean =>
    writingTarget?.kind === "turn" && writingTarget.line === turn.line
      ? writingTarget.nextChecked
      : turn.isChecked;
  const wakeClock = clockOf(view.wakeAt);

  const errorAt = (place: WritePlace) => {
    const isFailedHere = write.status === "error" && isWriteAt(write.target, place);
    if (!isFailedHere) {
      return undefined;
    }
    return <ErrorMessage failure={write.failure} onOpenSettings={onOpenSettings} />;
  };

  const timetable = buildTimetable(view.schedule, view.turns);
  const nowMarker = getNowMarker(timetable.slots.map(getSlotTime), minutesOfDay);

  const handleOpenSlot = (slot: string, taskId: string): void => {
    const isOpen = slotTask.detail.status !== "closed" && slotTask.detail.slot === slot;
    if (isOpen) {
      slotTask.close();
      return;
    }
    slotTask.open(slot, taskId);
  };

  const hasWoken = wakeClock !== undefined;
  const isWakeWriting = writingTarget?.kind === "wake";
  const wakeActionLabel = isWakeWriting ? "保存中" : "起きた";
  const wakeTimeLabel = wakeClock ?? "";
  const hasUnscheduledTurns = timetable.unscheduled.length > 0;
  const { question } = slotTask;
  const hasQuestion = question !== undefined;
  const isAddSheetOpen = slotSheet.kind === "add";
  const changingTarget = changingTargetOf(slotSheet);
  const isChangeSheetOpen = changingTarget !== undefined;

  const wakeDetail = (
    <div id={WAKE_DETAIL_ID} className="slot-detail">
      {!hasWoken && (
        <div className="wake">
          <span className="wake-text muted">起きたら押してください</span>
          <button
            type="button"
            className="button button-small wake-action"
            disabled={isWriting}
            onClick={handleWake}
          >
            {wakeActionLabel}
          </button>
        </div>
      )}
      {hasWoken && (
        <p className="wake-text">
          <span className="wake-time">{wakeClock}</span> に起床
        </p>
      )}
      {errorAt({ kind: "wake" })}
    </div>
  );

  const wakeToggle = (time: string, text: string) => (
    <button
      type="button"
      className="slot-main slot-toggle"
      aria-expanded={isWakeOpen}
      aria-controls={WAKE_DETAIL_ID}
      onClick={() => setIsWakeOpen(!isWakeOpen)}
    >
      <span className="slot-time">{time}</span>
      <span className="slot-what">{text}</span>
      <span className="turn-chevron" aria-hidden="true" />
    </button>
  );

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

      <section className="section" aria-labelledby="schedule-title">
        <div className="section-head">
          <h2 id="schedule-title" className="section-title">
            時間割
          </h2>
          <button
            type="button"
            className="button button-small"
            disabled={isWriting}
            onClick={() => setSlotSheet({ kind: "add" })}
          >
            コマを足す
          </button>
        </div>
        <ol className="panel timeline">
          {timetable.slots.map((slot, index) => {
            const isAddedWake = slot.source === "added-wake";
            if (isAddedWake) {
              return (
                <li key="added-wake" className="slot slot-mine">
                  <div className="slot-head">{wakeToggle(wakeTimeLabel, "起床")}</div>
                  {isWakeOpen && wakeDetail}
                </li>
              );
            }
            const { row, text, taskId, opens, turn } = slot;
            const key = slotKey(row);
            const isUnfolded = unfoldedSlots.has(key);
            const isFolded = canFoldSlot(row.actual, row.time, minutesOfDay) && !isUnfolded;
            const foldedLabel = `${row.time} ${text} 完了`;
            if (isFolded) {
              return (
                <li key={row.line} className="slot slot-folded">
                  <button
                    type="button"
                    className="slot-main slot-toggle slot-folded-toggle"
                    aria-label={foldedLabel}
                    aria-expanded={false}
                    onClick={() => setUnfoldedSlots((slots) => new Set(slots).add(key))}
                  >
                    <span className="slot-time">{row.time}</span>
                    <span className="slot-what">{text}</span>
                    <span className="tag">完了</span>
                  </button>
                </li>
              );
            }
            const isNow = isNowInSlot(row.time, minutesOfDay);
            const hasNowLine = nowMarker !== NO_NOW_MARKER && nowMarker.index === index;
            const nowLineStyle = { "--now-ratio": nowMarker?.ratio } as CSSProperties;
            const isMineSlot = isMine(row.who);
            const hasWho = row.who !== "";
            const hasTaskId = taskId !== undefined;
            const classes = joinClassNames(["slot", isMineSlot && "slot-mine", isNow && "slot-now"]);
            const whoClass = joinClassNames(["tag", isMineSlot && "tag-mine"]);
            const meta = (
              <span className="slot-meta">
                {isNow && <span className="tag tag-now">いま</span>}
                {hasWho && <span className={whoClass}>{row.who}</span>}
                {hasTaskId && <span className="slot-task">{taskId}</span>}
              </span>
            );
            const body = (
              <span className="slot-body">
                <span className="slot-what">{text}</span>
                {meta}
              </span>
            );
            const isWakeSlot = opens.kind === "wake";
            const isTaskSlot = opens.kind === "task";
            const isPlainSlot = opens.kind === "none";
            const isTaskOpen = slotTask.detail.status !== "closed" && slotTask.detail.slot === key;
            const detailId = `slot-detail-${row.line}`;
            const hasTurn = turn !== undefined;
            const isTurnWriting =
              hasTurn && writingTarget?.kind === "turn" && writingTarget.line === turn.line;
            const turnParts = turn && splitTurnLabel(turn.label);
            const checkboxId = `slot-box-${row.line}`;
            const turnSteps = turnParts?.steps;
            const hasTurnSteps = turnSteps !== undefined;
            const { actual } = row;
            const hasActualColumn = actual !== undefined;
            const actualValue = actualDrafts.get(key) ?? actual;
            const isActualWriting = writingTarget?.kind === "actual" && writingTarget.slot === key;
            const check = hasTurn && (
              <label className="slot-check" htmlFor={checkboxId} aria-label={turnParts?.title}>
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="turn-box"
                  checked={checkedOf(turn)}
                  disabled={isWriting}
                  onChange={() => handleToggle(turn)}
                />
              </label>
            );
            return (
              <li key={row.line} className={classes} aria-current={isNow ? "time" : undefined}>
                {hasNowLine && (
                  <span className="now-line" role="img" aria-label="現在時刻" style={nowLineStyle} />
                )}
                <div className="slot-head">
                  {isWakeSlot && wakeToggle(row.time, text)}
                  {isTaskSlot && (
                    <button
                      type="button"
                      className="slot-main slot-toggle"
                      aria-expanded={isTaskOpen}
                      aria-controls={detailId}
                      onClick={() => handleOpenSlot(key, opens.taskId)}
                    >
                      <span className="slot-time">{row.time}</span>
                      {body}
                      <span className="turn-chevron" aria-hidden="true" />
                    </button>
                  )}
                  {isPlainSlot && (
                    <div className="slot-main">
                      <span className="slot-time">{row.time}</span>
                      {body}
                    </div>
                  )}
                  {isTurnWriting && <span className="turn-status">保存中</span>}
                  <button
                    type="button"
                    className="icon-button slot-edit"
                    aria-label={`${row.time} のコマを直す`}
                    disabled={isWriting}
                    onClick={() => setSlotSheet({ kind: "change", target: { row, content: state.content } })}
                  >
                    <PenIcon size={18} />
                  </button>
                  {check}
                </div>
                {hasActualColumn && (
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
                      value={actualValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        setActualDraft(key, value);
                      }}
                      onBlur={() => saveActual(row)}
                    />
                    {isActualWriting && <span className="slot-actual-status">保存中</span>}
                  </form>
                )}
                {hasTurn && errorAt({ kind: "turn", line: turn.line })}
                {errorAt({ kind: "actual", slot: key })}
                {isWakeSlot && isWakeOpen && wakeDetail}
                {isTaskSlot && isTaskOpen && (
                  <div id={detailId} className="slot-detail">
                    {hasTurnSteps && <p className="turn-steps">{turnSteps}</p>}
                    <SlotTaskDetail
                      state={slotTask.detail}
                      settings={settings}
                      onRetry={() => slotTask.open(key, opens.taskId)}
                      onOpenSettings={onOpenSettings}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {hasUnscheduledTurns && (
        <section className="section" aria-labelledby="unscheduled-title">
          <div className="section-head">
            <h2 id="unscheduled-title" className="section-title">
              時間を決めていないこと
            </h2>
          </div>
          <ul className="panel turns">
            {timetable.unscheduled.map((turn) => {
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
              const turnError = errorAt({ kind: "turn", line: turn.line });
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
                    {turnError}
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
                  {turnError}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isAddSheetOpen && (
        <AddSlotSheet
          settings={settings}
          date={date}
          isOnline={isOnline}
          daily={daily}
          onClose={closeSlotSheet}
          onOpenSettings={onOpenSettings}
        />
      )}
      {isChangeSheetOpen && (
        <ChangeSlotSheet
          settings={settings}
          date={date}
          isOnline={isOnline}
          daily={daily}
          target={changingTarget}
          onClose={closeSlotSheet}
          onOpenSettings={onOpenSettings}
        />
      )}

      {hasQuestion && (
        <QuestionSheet
          settings={settings}
          isOnline={isOnline}
          initialQuestion={question}
          onClose={slotTask.closeQuestion}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  );
};
