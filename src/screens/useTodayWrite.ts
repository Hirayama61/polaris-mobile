import { useEffect, useState } from "react";
import { formatTokyoIso } from "../clock";
import {
  extractSchedule,
  extractTurns,
  type ScheduleRow,
  setScheduleActual,
  setTurnChecked,
  setWakeAt,
  type TurnItem,
} from "../daily";
import { describeFailure, type Failure } from "../failure";
import { writeKnownFile } from "../github";
import type { Settings } from "../settings";
import { dailyPath, type useDaily } from "../useDaily";
import type { WriteTarget } from "./writePlace";

/**
 * 「今日」の書き込みの状態。同じ daily への書き込みは 1 つずつにする。
 */
export type WriteState =
  | { status: "idle" }
  | { status: "writing"; target: WriteTarget }
  // 失敗は操作した行のすぐ下に出す。一覧の末尾だとスクロールしないと見えない。
  | { status: "error"; target: WriteTarget; failure: Failure };

/**
 * 保存前と保存に失敗した実績の入力。キーは時間枠 (`slotKey`)。`date` はその入力を書いた daily の日付。
 */
export type ActualDrafts = { date: string; drafts: ReadonlyMap<string, string> };

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため保存できません。",
  hint: "つながったらもう一度タップしてください。",
  action: "retry",
};

const NO_ACTUAL = "";

/**
 * 時間枠を見分けるキー。起床の記録などで frontmatter の行が増えると表の行番号がずれるので、時刻とやることで見分ける。
 *
 * @param row - 時間割の行。
 */
export const slotKey = (row: ScheduleRow): string => `${row.time}\u0000${row.what}`;

/**
 * 表示中の日付に対する実績の入力を返す。日付が変わっていれば空にする。
 *
 * @remarks 4:00 をまたいだら、前日の時間割で持っている入力を当日の daily に書かないために使う。
 * 同じ日付なら `stored` をそのまま返すので、呼び出し側は戻り値が `stored` と違うかで日付の変化を知る。
 *
 * @param stored - 持っている入力。
 * @param date - 表示中の daily の日付。
 */
export const getDraftsOfDate = (stored: ActualDrafts, date: string): ActualDrafts => {
  const isSameDate = stored.date === date;
  if (isSameDate) {
    return stored;
  }
  return { date, drafts: new Map() };
};

/**
 * 保存できた実績の入力を消す。保存中に書き換えた分は残す。
 *
 * @param drafts - いまの入力。
 * @param slot - 保存した時間枠。
 * @param saved - 保存した値。
 */
export const removeSavedDraft = (
  drafts: ReadonlyMap<string, string>,
  slot: string,
  saved: string,
): ReadonlyMap<string, string> => {
  const isEditedWhileSaving = drafts.get(slot) !== saved;
  if (isEditedWhileSaving) {
    return drafts;
  }
  const next = new Map(drafts);
  next.delete(slot);
  return next;
};

/**
 * 実績の入力を保存するか。入力が無いか、daily の実績と同じなら保存しない。
 *
 * @param draft - 入力。無ければ `undefined`。
 * @param actual - daily の実績。無ければ `undefined`。
 */
export const canSaveActual = (draft: string | undefined, actual: string | undefined): boolean => {
  const hasDraft = draft !== undefined;
  if (!hasDraft) {
    return false;
  }
  const isUnchanged = draft.trim() === (actual ?? NO_ACTUAL);
  return !isUnchanged;
};

/**
 * 書き込みを始めたときの状態を返す。
 *
 * @remarks 書き込み中なら `write` をそのまま返す。押し直しで同じ書き込みを 2 回送らないため。
 *
 * @param write - いまの状態。
 * @param isOnline - オンラインか。
 * @param target - 書く対象。
 */
export const getStartedWrite = (write: WriteState, isOnline: boolean, target: WriteTarget): WriteState => {
  const isWriting = write.status === "writing";
  if (isWriting) {
    return write;
  }
  if (!isOnline) {
    return { status: "error", target, failure: OFFLINE_FAILURE };
  }
  return { status: "writing", target };
};

/**
 * オフラインで出した失敗を消した状態を返す。ほかの失敗は残す。
 *
 * @param write - いまの状態。
 */
export const clearOfflineFailure = (write: WriteState): WriteState => {
  const isOfflineFailure = write.status === "error" && write.failure === OFFLINE_FAILURE;
  if (!isOfflineFailure) {
    return write;
  }
  return { status: "idle" };
};

/**
 * 「今日」のチェック、起床、実績の書き込みと、実績の入力を持つ。
 *
 * @remarks 何を出すかと、日付が変わったときに閉じるシートや開閉は持たない。それは `onDateChange` で画面が決める。
 * 日付の変化は effect ではなく描画中に見る。effect だと、日付が変わった直後の 1 回の描画で前日の入力が残る。
 *
 * @param settings - 接続設定。
 * @param date - 表示中の daily の日付。
 * @param isOnline - オンラインか。
 * @param daily - 今日の daily。`ready` のときだけ書く。
 * @param onDateChange - 日付が変わった描画で呼ぶ。
 */
export const useTodayWrite = (
  settings: Settings,
  date: string,
  isOnline: boolean,
  daily: ReturnType<typeof useDaily>,
  onDateChange: () => void,
) => {
  const [write, setWrite] = useState<WriteState>({ status: "idle" });
  const [storedDrafts, setStoredDrafts] = useState<ActualDrafts>(() => ({ date, drafts: new Map() }));
  const currentDrafts = getDraftsOfDate(storedDrafts, date);
  const hasDateChanged = currentDrafts !== storedDrafts;
  if (hasDateChanged) {
    setStoredDrafts(currentDrafts);
    onDateChange();
  }
  const actualDrafts = currentDrafts.drafts;

  useEffect(() => {
    if (isOnline) {
      setWrite(clearOfflineFailure);
    }
  }, [isOnline]);

  const isWriting = write.status === "writing";
  const writingTarget = write.status === "writing" ? write.target : undefined;

  const updateDrafts = (update: (drafts: ReadonlyMap<string, string>) => ReadonlyMap<string, string>): void =>
    setStoredDrafts((stored) => ({ date: stored.date, drafts: update(stored.drafts) }));

  const runWrite = (
    target: WriteTarget,
    what: string,
    transform: (current: string) => string,
    onWritten?: () => void,
  ): void => {
    const { state } = daily;
    const isReady = state.status === "ready";
    if (!isReady) {
      return;
    }
    const started = getStartedWrite(write, isOnline, target);
    const isAlreadyWriting = started === write;
    if (isAlreadyWriting) {
      return;
    }
    setWrite(started);
    const hasStarted = started.status === "writing";
    if (!hasStarted) {
      return;
    }
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
        setWrite({ status: "error", target, failure: describeFailure(error) });
      });
  };

  const handleToggle = (turn: TurnItem): void => {
    const nextChecked = !turn.isChecked;
    // 再試行時はリモートの最新内容に当てるので、行番号ではなくラベルで探し直す。
    runWrite({ kind: "turn", line: turn.line, nextChecked }, "チェック", (current) => {
      const target = extractTurns(current).find((candidate) => candidate.label === turn.label);
      return target === undefined ? current : setTurnChecked(current, target.line, nextChecked);
    });
  };

  const handleWake = (): void => {
    const wakeAt = formatTokyoIso(new Date());
    runWrite({ kind: "wake" }, "起床", (current) => setWakeAt(current, wakeAt));
  };

  const setActualDraft = (slot: string, value: string): void =>
    updateDrafts((drafts) => new Map(drafts).set(slot, value));

  const saveActual = (row: ScheduleRow): void => {
    const slot = slotKey(row);
    const value = actualDrafts.get(slot);
    if (value === undefined || !canSaveActual(value, row.actual)) {
      return;
    }
    // 再試行時はリモートの最新内容に当てるので、行番号ではなく時間枠で探し直す。
    runWrite(
      { kind: "actual", slot },
      "実績",
      (current) => {
        const target = extractSchedule(current).find((candidate) => slotKey(candidate) === slot);
        return target === undefined ? current : setScheduleActual(current, target.line, value);
      },
      () => updateDrafts((drafts) => removeSavedDraft(drafts, slot, value)),
    );
  };

  return {
    write,
    isWriting,
    writingTarget,
    actualDrafts,
    setActualDraft,
    handleToggle,
    handleWake,
    saveActual,
  };
};
