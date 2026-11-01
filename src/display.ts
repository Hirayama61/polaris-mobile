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

/**
 * 時間割の上で現在時刻の線を引く位置。
 */
export type NowMarker = {
  /** 線を引くコマの、渡した配列での位置。 */
  index: number;
  /** コマの上端を 0、下端を 1 とした線の位置。 */
  ratio: number;
};

/** 線を引かない。 */
export const NO_NOW_MARKER = undefined;

const START_OF_SLOT = 0;

type IndexedRange = SlotRange & { index: number };

const toIndexedRange = (time: string, index: number): IndexedRange[] => {
  const range = toSlotRange(time);
  if (range === NO_SLOT_RANGE) {
    return [];
  }
  return [{ ...range, index }];
};

const getRatioInRange = (range: SlotRange, minutesOfDay: number): number =>
  (minutesOfDay - range.start) / (range.end - range.start);

const byStart = (a: IndexedRange, b: IndexedRange): number => a.start - b.start;

/**
 * 時間割で現在時刻の線を引く位置を決める。
 *
 * @remarks コマの高さや表示は持たない。線の描き方は画面で決める。
 * @param times - 表示順の時間割の「時刻」。起床のように時刻の無いコマは空文字で渡す。
 * @param minutesOfDay - 0:00 からの経過分。
 * @returns 現在時刻を含むコマがあれば、その中の割合。コマとコマの間なら、次に始まるコマの上端。
 *   最初のコマより前、最後のコマより後、時刻の読めるコマが無いときは {@link NO_NOW_MARKER}。
 */
export const getNowMarker = (times: readonly string[], minutesOfDay: number): NowMarker | undefined => {
  const ranges = times.flatMap(toIndexedRange);
  const current = ranges.find((range) => minutesOfDay >= range.start && minutesOfDay < range.end);
  if (current !== undefined) {
    return { index: current.index, ratio: getRatioInRange(current, minutesOfDay) };
  }
  const hasStarted = ranges.some((range) => range.start <= minutesOfDay);
  const next = ranges.filter((range) => range.start > minutesOfDay).sort(byStart)[0];
  if (!hasStarted || next === undefined) {
    return NO_NOW_MARKER;
  }
  return { index: next.index, ratio: START_OF_SLOT };
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
