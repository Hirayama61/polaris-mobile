import type { ScheduleRow, TurnItem } from "./daily";
import { splitTaskRef, splitTurnLabel } from "./display";

/**
 * 「今日」に出す時間割を、daily の時間割と「あなたの番」から組み立てる純粋関数。
 *
 * 表示だけを決める。daily には何も書かない。
 */

const WAKE_PREFIX = "起床";

/**
 * コマをタップしたときに開くもの。起床のコマは task id があっても起床を開く。
 */
export type SlotOpens = { kind: "wake" } | { kind: "task"; taskId: string } | { kind: "none" };

/**
 * 時間割の 1 コマ。`added-wake` は時間割に起床のコマが無い日に足す表示だけの行で、daily に対応する行を持たない。
 */
export type TimetableSlot =
  | {
      source: "schedule";
      row: ScheduleRow;
      text: string;
      taskId: string | undefined;
      opens: SlotOpens;
      /** コマと同じ task id を持つ「あなたの番」の項目。 */
      turn: TurnItem | undefined;
    }
  | { source: "added-wake" };

/**
 * 時間割と、どのコマにも入っていない「あなたの番」の項目。
 */
export type Timetable = {
  slots: TimetableSlot[];
  unscheduled: TurnItem[];
};

/**
 * 起床のコマかを決める。
 *
 * @param text - `(task: ID)` を除いたやること。
 * @returns `起床` で始まれば true。
 */
export const isWakeText = (text: string): boolean => text.startsWith(WAKE_PREFIX);

const turnTaskIdOf = (turn: TurnItem): string | undefined => splitTurnLabel(turn.label).taskId;

const getSlotOpens = (text: string, taskId: string | undefined): SlotOpens => {
  const isWake = isWakeText(text);
  const hasTaskId = taskId !== undefined;
  if (isWake) {
    return { kind: "wake" };
  }
  if (hasTaskId) {
    return { kind: "task", taskId };
  }
  return { kind: "none" };
};

type ScheduleSlot = Extract<TimetableSlot, { source: "schedule" }>;

const findTurn = (turns: readonly TurnItem[], taskId: string | undefined): TurnItem | undefined => {
  const hasTaskId = taskId !== undefined;
  if (!hasTaskId) {
    return undefined;
  }
  return turns.find((candidate) => turnTaskIdOf(candidate) === taskId);
};

const toScheduleSlot = (row: ScheduleRow, turns: readonly TurnItem[]): ScheduleSlot => {
  const { text, taskId } = splitTaskRef(row.what);
  const turn = findTurn(turns, taskId);
  return { source: "schedule", row, text, taskId, opens: getSlotOpens(text, taskId), turn };
};

const withWakeSlot = (slots: readonly ScheduleSlot[]): TimetableSlot[] => {
  const hasWake = slots.some((slot) => slot.opens.kind === "wake");
  if (hasWake) {
    return [...slots];
  }
  return [{ source: "added-wake" }, ...slots];
};

const hasTurn = (slot: ScheduleSlot): slot is ScheduleSlot & { turn: TurnItem } => slot.turn !== undefined;

/**
 * 時間割のコマを並べ、「あなたの番」の項目を同じ task id のコマに結び付ける。
 *
 * @param schedule - daily の時間割。
 * @param turns - daily の「あなたの番」。
 * @returns 起床のコマが無ければ先頭に `added-wake` を足す。どのコマにも結び付かなかった項目は `unscheduled`。
 */
export const buildTimetable = (schedule: readonly ScheduleRow[], turns: readonly TurnItem[]): Timetable => {
  const scheduleSlots = schedule.map((row) => toScheduleSlot(row, turns));
  // 同じ task id の項目が複数あってもコマに出すのは最初の 1 件なので、結び付けた行だけを除く。
  const linkedLines = new Set(scheduleSlots.filter(hasTurn).map((slot) => slot.turn.line));
  const unscheduled = turns.filter((turn) => !linkedLines.has(turn.line));
  return { slots: withWakeSlot(scheduleSlots), unscheduled };
};
