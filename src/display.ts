/**
 * daily から取り出した文字列を画面向けに整える純粋関数。
 *
 * daily の内容そのものは変えない。表示だけを変える。
 */

/**
 * ラベルを本文と task ID に分けた結果。
 */
export type LabelParts = {
  text: string;
  taskId: string | undefined;
};

const TASK_REF_PATTERN = /^(.*?)\s*\(task:\s*([^)]+)\)\s*$/;

/**
 * 末尾の `(task: ID)` を本文から切り離す。
 *
 * @param label - 「あなたの番」や時間割の文字列。
 * @returns 末尾に `(task: ID)` があれば本文と ID、なければ全体を本文として返す。
 */
export const splitTaskRef = (label: string): LabelParts => {
  const match = TASK_REF_PATTERN.exec(label);
  const text = match?.[1];
  const taskId = match?.[2];
  if (text === undefined || taskId === undefined || text === "") {
    return { text: label, taskId: undefined };
  }
  return { text, taskId: taskId.trim() };
};

const SLOT_PATTERN = /^(\d{1,2}):(\d{2})\s*[–\-~〜]\s*(\d{1,2}):(\d{2})$/;

type SlotRange = { start: number; end: number };

const NO_SLOT_RANGE = undefined;

const toSlotRange = (time: string): SlotRange | undefined => {
  const match = SLOT_PATTERN.exec(time.trim());
  if (match === null) {
    return NO_SLOT_RANGE;
  }
  const [, startHour, startMinute, endHour, endMinute] = match;
  const start = Number(startHour) * 60 + Number(startMinute);
  const end = Number(endHour) * 60 + Number(endMinute);
  return { start, end };
};

/**
 * 時間割の「時刻」が現在時刻を含むかを判定する。
 *
 * @param time - `07:00–07:30` の形。区切りは en dash・ハイフン・波線を受け付ける。
 * @param minutesOfDay - 0:00 からの経過分。
 * @returns 開始を含み終了を含まない範囲に入っていれば true。形式が違えば false。
 */
export const isNowInSlot = (time: string, minutesOfDay: number): boolean => {
  const range = toSlotRange(time);
  if (range === NO_SLOT_RANGE) {
    return false;
  }
  return minutesOfDay >= range.start && minutesOfDay < range.end;
};

/**
 * 時間割の「時刻」の終了が現在時刻以前かを判定する。
 *
 * @param time - `07:00–07:30` の形。区切りは {@link isNowInSlot} と同じ。
 * @param minutesOfDay - 0:00 からの経過分。
 * @returns 終了時刻が現在以前なら true。形式が違えば、終わったか分からないので false。
 */
export const hasSlotEnded = (time: string, minutesOfDay: number): boolean => {
  const range = toSlotRange(time);
  if (range === NO_SLOT_RANGE) {
    return false;
  }
  return range.end <= minutesOfDay;
};

const DONE_ACTUAL = "完了";

/**
 * 時間割の「実績」が完了を表すかを判定する。
 *
 * @param actual - 実績のセル。列やセルが無ければ undefined。
 * @returns 前後の空白を除いて「完了」と一致すれば true。「完了 20分」のような書き足しは完了とみなさない。
 */
export const isDoneActual = (actual: string | undefined): boolean => actual?.trim() === DONE_ACTUAL;

/**
 * 「今日」の時間割で、コマを 1 行に畳むかを判定する。
 *
 * @remarks 利用者がタップで開いたかは持たない。開閉は画面の state で決める。
 * @param actual - 実績のセル。列やセルが無ければ undefined。
 * @param time - 時間割の「時刻」。
 * @param minutesOfDay - 0:00 からの経過分。
 * @returns 実績が「完了」で、終了時刻が現在以前なら true。
 */
export const canFoldSlot = (actual: string | undefined, time: string, minutesOfDay: number): boolean =>
  isDoneActual(actual) && hasSlotEnded(time, minutesOfDay);

/**
 * 「あなたの番」の 1 項目を 1 行表示と展開部分に分けた結果。
 */
export type TurnParts = {
  title: string;
  steps: string | undefined;
  minutes: string | undefined;
  taskId: string | undefined;
};

const MINUTES_PATTERN = /[(（]\s*(\d+)\s*分\s*[)）]\s*$/;
const TITLE_SEPARATOR = ": ";

/**
 * 「あなたの番」のラベルをタイトル・手順・目安時間・task ID に分ける。
 *
 * @param label - `タイトル: 手順 (N 分) (task: ID)` の形。手順・目安時間・task は無くてもよい。
 * @returns `: ` が無い、またはその前後が空なら steps と minutes を undefined にし、本文全体を title にする。
 */
export const splitTurnLabel = (label: string): TurnParts => {
  const { text, taskId } = splitTaskRef(label);
  const separatorAt = text.indexOf(TITLE_SEPARATOR);
  const title = separatorAt < 0 ? "" : text.slice(0, separatorAt).trim();
  const steps = separatorAt < 0 ? "" : text.slice(separatorAt + TITLE_SEPARATOR.length).trim();
  if (title === "" || steps === "") {
    return { title: text, steps: undefined, minutes: undefined, taskId };
  }
  const minutes = MINUTES_PATTERN.exec(steps)?.[1];
  return { title, steps, minutes: minutes === undefined ? undefined : `${minutes} 分`, taskId };
};
