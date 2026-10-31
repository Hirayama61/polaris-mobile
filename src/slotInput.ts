import { toScheduleTime } from "./daily";

/**
 * 時間割のコマを直すシートの入力を確かめる純粋関数。
 *
 * @remarks daily には書かない。書き換えは `src/daily.ts` が決める。
 */

/**
 * 入力を確かめた結果。`ok` なら daily に書く値を持つ。
 */
export type SlotInputCheck =
  | { kind: "ok"; time: string; what: string }
  | { kind: "invalid"; field: "time" | "what"; message: string };

/**
 * 開始・終了・やることを確かめ、書く値にする。
 *
 * @param start - 開始の `HH:MM`。
 * @param end - 終了の `HH:MM`。
 * @param what - やること。
 * @returns 時刻が `HH:MM` でないか、やることが空なら `invalid`。
 */
export const checkSlotInput = (start: string, end: string, what: string): SlotInputCheck => {
  const time = toScheduleTime(start, end);
  const trimmedWhat = what.trim();
  const isTimeInvalid = time === undefined;
  const isWhatEmpty = trimmedWhat === "";
  if (isTimeInvalid) {
    return { kind: "invalid", field: "time", message: "開始と終了の時刻を 07:00 の形で入れてください。" };
  }
  if (isWhatEmpty) {
    return { kind: "invalid", field: "what", message: "やることを入れてください。" };
  }
  return { kind: "ok", time, what: trimmedWhat };
};
