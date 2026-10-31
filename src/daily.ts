/**
 * daily ファイル(Markdown + frontmatter)を読み書きする純粋関数。
 *
 * 朝ジョブと夜ジョブも同じファイルを書くため、ここで変更してよいのは
 * 「あなたの番」のチェック状態・「振り返り」の本文・frontmatter の `review_at` と `wake_at`・
 * 時間割の「実績」列のセル・時間割の行の時刻とやること (変更、追加、削除) だけ。それ以外の行は 1 文字も変えない。
 * 直した行と足した行の「誰」は「あなた」にする。「実績」列が無い表に列を足さない。
 * `extractSection` `replaceSection` `setFrontmatterValue` はブログ (`src/blog.ts`) も使う。
 */

/**
 * 「今日の時間割」の表の 1 行。
 *
 * `line` は daily 全体での行番号(0 始まり)。`actual` は「実績」列のセル。列が無い表、またはその行にセルが無ければ undefined。
 */
export type ScheduleRow = {
  line: number;
  time: string;
  what: string;
  who: string;
  actual: string | undefined;
};

/**
 * 「あなたの番」のチェック項目。
 *
 * `line` は daily 全体での行番号(0 始まり)。チェックの切り替えに使う。
 */
export type TurnItem = {
  line: number;
  isChecked: boolean;
  label: string;
};

/**
 * 画面表示に必要な daily の内容。
 */
export type DailyView = {
  schedule: readonly ScheduleRow[];
  turns: readonly TurnItem[];
  review: string;
  reviewAt: string | undefined;
  wakeAt: string | undefined;
};

type SectionRange = {
  headingLine: number;
  /** 本文の先頭行。見出しの次の行。 */
  start: number;
  /** 本文の終端(この行を含まない)。次の見出しの行、または行数。 */
  end: number;
};

const HEADING_PREFIX = "## ";
const FRONTMATTER_DELIMITER = "---";

const splitLines = (text: string): readonly string[] => text.split("\n");

const frontmatterEnd = (lines: readonly string[]): number | undefined => {
  if (lines[0] !== FRONTMATTER_DELIMITER) {
    return undefined;
  }
  const closing = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_DELIMITER);
  return closing === -1 ? undefined : closing;
};

const FENCE_PATTERN = /^\s*(```|~~~)/;

// コードフェンスの中の行は見出しとみなさない。記事の本文に Markdown の例が入るため。
const toHeadingFlags = (lines: readonly string[]): boolean[] => {
  let isInFence = false;
  return lines.map((line) => {
    if (FENCE_PATTERN.test(line)) {
      isInFence = !isInFence;
      return false;
    }
    return !isInFence && line.startsWith(HEADING_PREFIX);
  });
};

// 見出しは括弧つきの揺れ(「あなたの番 (3 つまで)」)があるので、名前の後ろは空白か括弧までを許す。
// 「一言で伝えるコツ」のような別の見出しを「一言」とみなさないよう、名前の続きの文字は許さない。
const isSectionTitle = (title: string, name: string): boolean => {
  if (!title.startsWith(name)) {
    return false;
  }
  const rest = title.slice(name.length);
  return rest === "" || /^[\s(（]/.test(rest);
};

const findSection = (lines: readonly string[], name: string): SectionRange | undefined => {
  const bodyStart = (frontmatterEnd(lines) ?? -1) + 1;
  const isHeading = toHeadingFlags(lines);
  const headingLine = lines.findIndex(
    (line, index) =>
      index >= bodyStart &&
      isHeading[index] === true &&
      isSectionTitle(line.slice(HEADING_PREFIX.length).trim(), name),
  );
  if (headingLine === -1) {
    return undefined;
  }
  const nextHeading = isHeading.findIndex((flag, index) => index > headingLine && flag);
  return {
    headingLine,
    start: headingLine + 1,
    end: nextHeading === -1 ? lines.length : nextHeading,
  };
};

const sectionLines = (lines: readonly string[], name: string): readonly string[] => {
  const range = findSection(lines, name);
  return range === undefined ? [] : lines.slice(range.start, range.end);
};

const parseTableRow = (line: string): readonly string[] | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return undefined;
  }
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
};

const isSeparatorRow = (cells: readonly string[]): boolean => cells.every((cell) => /^:?-+:?$/.test(cell));

const ACTUAL_HEADER = "実績";

type ScheduleTable = {
  rows: readonly { line: number; cells: readonly string[] }[];
  /** 「実績」列の位置。列が無ければ undefined。 */
  actualColumn: number | undefined;
  /** ヘッダーの列の数。表が無ければ 0。 */
  columnCount: number;
  /** 表の最後の行(区切り行を含む)の行番号。表が無ければ undefined。 */
  lastLine: number | undefined;
};

const findScheduleTable = (lines: readonly string[]): ScheduleTable => {
  const range = findSection(lines, "今日の時間割");
  if (range === undefined) {
    return { rows: [], actualColumn: undefined, columnCount: 0, lastLine: undefined };
  }
  const tableRows: { line: number; cells: readonly string[] }[] = [];
  for (let index = range.start; index < range.end; index += 1) {
    const cells = parseTableRow(lines[index] ?? "");
    if (cells !== undefined) {
      tableRows.push({ line: index, cells });
    }
  }
  // 先頭行はヘッダー。
  const header = tableRows[0]?.cells ?? [];
  const actualIndex = header.indexOf(ACTUAL_HEADER);
  return {
    rows: tableRows.slice(1).filter(({ cells }) => !isSeparatorRow(cells)),
    actualColumn: actualIndex === -1 ? undefined : actualIndex,
    columnCount: header.length,
    lastLine: tableRows.at(-1)?.line,
  };
};

/**
 * 「今日の時間割」の表を行ごとに取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns ヘッダーと区切り行を除いた表の行。表が無ければ空配列。
 */
export const extractSchedule = (text: string): readonly ScheduleRow[] => {
  const { rows, actualColumn } = findScheduleTable(splitLines(text));
  return rows.map(({ line, cells }) => ({
    line,
    time: cells[0] ?? "",
    what: cells[1] ?? "",
    who: cells[2] ?? "",
    actual: actualColumn === undefined ? undefined : cells[actualColumn],
  }));
};

// 行の中の `|` の位置。parseTableRow と同じく、すべての `|` を区切りとみなす。
const pipePositions = (line: string): readonly number[] => {
  const positions: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "|") {
      positions.push(index);
    }
  }
  return positions;
};

// 改行と `|` は表を壊すので、空白と全角の `｜` に置き換える。
const toCellValue = (value: string): string => value.replace(/\s+/g, " ").replace(/\|/g, "｜").trim();

const EMPTY_CELL = "";

const toTableCell = (cell: string): string => {
  if (cell === EMPTY_CELL) {
    return " ";
  }
  return ` ${cell} `;
};

const toTableLine = (cells: readonly string[]): string => `|${cells.map(toTableCell).join("|")}|`;

const SCHEDULE_TIME_PATTERN = /^\d{2}:[0-5]\d–\d{2}:[0-5]\d$/;

/** 直した行と足した行の「誰」。 */
export const SCHEDULE_WHO_MINE = "あなた";

/**
 * 時間割の時刻として受け付ける形かを判定する。
 *
 * @param time - 時刻のセルに書く値。
 * @returns `HH:MM–HH:MM` (区切りは en dash) なら true。
 */
export const isScheduleTime = (time: string): boolean => SCHEDULE_TIME_PATTERN.test(time);

/**
 * 開始と終了の時刻から、時間割の時刻のセルの値を作る。
 *
 * @param start - `HH:MM`。
 * @param end - `HH:MM`。
 * @returns `HH:MM–HH:MM`。形が違えば undefined。
 */
export const toScheduleTime = (start: string, end: string): string | undefined => {
  const time = `${start.trim()}–${end.trim()}`;
  if (!isScheduleTime(time)) {
    return undefined;
  }
  return time;
};

const LOOSE_TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*[–\-~〜]\s*(\d{1,2}):(\d{2})$/;

/** 時刻のセルから開始と終了を読めなかったときの値。 */
export const NO_CLOCK = "";

/**
 * 時間割の時刻のセルを開始と終了に分ける。直す欄の初期値に使う。
 *
 * @param time - 時刻のセル。区切りは en dash・ハイフン・波線を受け付ける。
 * @returns 2 桁にそろえた `HH:MM` の組。読めなければ両方 `NO_CLOCK`。
 */
export const splitScheduleTime = (time: string): { start: string; end: string } => {
  const match = LOOSE_TIME_PATTERN.exec(time.trim());
  if (match === null) {
    return { start: NO_CLOCK, end: NO_CLOCK };
  }
  const [, startHour = "", startMinute = "", endHour = "", endMinute = ""] = match;
  return {
    start: `${startHour.padStart(2, "0")}:${startMinute}`,
    end: `${endHour.padStart(2, "0")}:${endMinute}`,
  };
};

/**
 * 時間割の 1 行の時刻とやることを書き換え、「誰」を「あなた」にする。
 *
 * @param text - daily ファイル全体。
 * @param line - 対象の行番号(`ScheduleRow.line`)。
 * @param time - 新しい時刻。`isScheduleTime` を満たすこと。
 * @param what - 新しいやること。改行は空白に、`|` は全角の `｜` に置き換える。
 * @returns その行だけを変えた全文。「実績」など 4 列目以降のセルはそのまま残す。対象行が表の行でなければ元の全文。
 */
export const setScheduleRow = (text: string, line: number, time: string, what: string): string => {
  const lines = splitLines(text);
  const { rows } = findScheduleTable(lines);
  const target = lines[line];
  const isRow = rows.some((candidate) => candidate.line === line);
  if (!isRow || target === undefined) {
    return text;
  }
  // 先頭 3 列 (時刻・やること・誰) の後ろは、3 番目の `|` から後ろを 1 文字も変えずに残す。
  const pipes = pipePositions(target);
  const indent = target.slice(0, pipes[0] ?? 0);
  const head = toTableLine([time, toCellValue(what), SCHEDULE_WHO_MINE]);
  const rest = restOfRow(target, pipes[3]);
  const next = [...lines];
  next[line] = `${indent}${head}${rest}`;
  return next.join("\n");
};

// 3 番目の `|` から後ろ。無ければ空。
const restOfRow = (target: string, restStart: number | undefined): string => {
  if (restStart === undefined) {
    return "";
  }
  return target.slice(restStart + 1);
};

const isSameRow = (a: ScheduleRow, b: ScheduleRow): boolean =>
  a.time === b.time && a.what === b.what && a.who === b.who && a.actual === b.actual;

/**
 * 開いたときと同じ中身の行を、いまの daily から探す。
 *
 * 行番号は起床の記録などでずれるので、時刻・やること・誰・実績がすべて同じ行を探す。
 *
 * @param text - いまの daily ファイル全体。
 * @param row - 開いたときの行。
 * @returns 同じ中身の最初の行。変わっていたか消えていれば undefined。
 */
export const findSameScheduleRow = (text: string, row: ScheduleRow): ScheduleRow | undefined =>
  extractSchedule(text).find((candidate) => isSameRow(candidate, row));

/**
 * 中身 (時刻・やること・誰・実績) が同じ行の数を数える。直すと消すの再試行で、別の同じ行に当て直さないために使う。
 *
 * @param text - daily ファイル全体。
 * @param row - 開いたときの行。
 * @returns 時間割の表で中身が一致する行の数。
 */
export const countSameScheduleRow = (text: string, row: ScheduleRow): number =>
  extractSchedule(text).filter((candidate) => isSameRow(candidate, row)).length;

/**
 * 消す操作が、押したときの daily に対してもう書けているかを判定する。応答を受け取れずに押し直したときに使う。
 *
 * @param base - 押したときの daily。
 * @param current - いまの daily。
 * @param row - 開いたときの行。
 * @returns 同じ中身の行と表の行の両方が押したときより減っていれば true。他の更新で中身が変わっただけなら false。
 */
export const hasRemovedScheduleRow = (base: string, current: string, row: ScheduleRow): boolean => {
  const hasFewerSame = countSameScheduleRow(current, row) < countSameScheduleRow(base, row);
  const hasFewerRows = extractSchedule(current).length < extractSchedule(base).length;
  return hasFewerSame && hasFewerRows;
};

/**
 * 直す操作が、押したときの daily に対してもう書けているかを判定する。応答を受け取れずに押し直したときに使う。
 *
 * @param base - 押したときの daily。
 * @param current - いまの daily。
 * @param row - 開いたときの行。
 * @param time - 直した後の時刻。
 * @param what - 直した後のやること。
 * @returns 元の中身の行が減り、直した後の中身の行が増えていれば true。他の更新で中身が変わっただけなら false。
 */
export const hasChangedScheduleRow = (
  base: string,
  current: string,
  row: ScheduleRow,
  time: string,
  what: string,
): boolean => {
  const changed: ScheduleRow = { ...row, time, what: toCellValue(what), who: SCHEDULE_WHO_MINE };
  const hasFewerOld = countSameScheduleRow(current, row) < countSameScheduleRow(base, row);
  const hasMoreNew = countSameScheduleRow(current, changed) > countSameScheduleRow(base, changed);
  return hasFewerOld && hasMoreNew;
};

const startOf = (time: string): string => time.split("–")[0]?.trim() ?? "";

/**
 * 時刻とやることが同じ行の数を数える。足す操作の再試行で同じ行を二重に入れないために使う。
 *
 * @param text - daily ファイル全体。
 * @param time - 時刻。
 * @param what - やること。`insertScheduleRow` と同じく置き換えてから比べる。
 * @returns 時間割の表で時刻とやることが一致する行の数。
 */
export const countSameScheduleRows = (text: string, time: string, what: string): number => {
  const value = toCellValue(what);
  return extractSchedule(text).filter((row) => row.time === time && row.what === value).length;
};

/**
 * 時間割に 1 行足す。「誰」は「あなた」、4 列目以降のセルは空にする。
 *
 * @param text - daily ファイル全体。
 * @param time - 時刻。`isScheduleTime` を満たすこと。
 * @param what - やること。改行は空白に、`|` は全角の `｜` に置き換える。
 * @returns 開始時刻がより遅い最初の行の前 (無ければ表の末尾) に 1 行入れた全文。表が無ければ元の全文。
 */
export const insertScheduleRow = (text: string, time: string, what: string): string => {
  const lines = splitLines(text);
  const { rows, columnCount, lastLine } = findScheduleTable(lines);
  if (lastLine === undefined) {
    return text;
  }
  const start = startOf(time);
  const later = rows.find((row) => startOf(row.cells[0] ?? "") > start);
  const insertAt = later?.line ?? lastLine + 1;
  const emptyCells = Array.from({ length: Math.max(columnCount - 3, 0) }, () => EMPTY_CELL);
  const added = toTableLine([time, toCellValue(what), SCHEDULE_WHO_MINE, ...emptyCells]);
  return [...lines.slice(0, insertAt), added, ...lines.slice(insertAt)].join("\n");
};

/**
 * 時間割の 1 行を消す。
 *
 * @param text - daily ファイル全体。
 * @param line - 対象の行番号(`ScheduleRow.line`)。
 * @returns その行だけを除いた全文。対象行が表の行でなければ元の全文。
 */
export const removeScheduleRow = (text: string, line: number): string => {
  const lines = splitLines(text);
  const { rows } = findScheduleTable(lines);
  const isRow = rows.some((candidate) => candidate.line === line);
  if (!isRow) {
    return text;
  }
  return lines.filter((_, index) => index !== line).join("\n");
};

/**
 * 時間割の 1 行の「実績」セルを書き換える。
 *
 * @param text - daily ファイル全体。
 * @param line - 対象の行番号(`ScheduleRow.line`)。
 * @param actual - 新しい値。改行は空白に、`|` は全角の `｜` に置き換え、前後の空白は取り除く。
 * @returns そのセルだけを変えた全文。表に「実績」列が無い、対象行が表の行でない、またはその行にセルが無ければ元の全文。
 */
export const setScheduleActual = (text: string, line: number, actual: string): string => {
  const lines = splitLines(text);
  const { rows, actualColumn } = findScheduleTable(lines);
  const target = lines[line];
  if (actualColumn === undefined || target === undefined) {
    return text;
  }
  const row = rows.find((candidate) => candidate.line === line);
  if (row?.cells[actualColumn] === undefined) {
    return text;
  }
  // 先頭の `|` を 0 番目として、列 n のセルは n 番目と n+1 番目の `|` の間。末尾の `|` を省いた行では行末まで。
  const pipes = pipePositions(target);
  const start = pipes[actualColumn] ?? 0;
  const end = pipes[actualColumn + 1];
  const value = toCellValue(actual);
  const replaced =
    end === undefined
      ? `${target.slice(0, start + 1)}${value === "" ? " " : ` ${value}`}`
      : `${target.slice(0, start + 1)}${value === "" ? " " : ` ${value} `}${target.slice(end)}`;
  return lines.map((current, index) => (index === line ? replaced : current)).join("\n");
};

const CHECKBOX_PATTERN = /^(\s*[-*]\s+)\[( |x|X)\]\s+(.*)$/;

/**
 * 「あなたの番」のチェック項目を取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 出現順のチェック項目。節が無ければ空配列。
 */
export const extractTurns = (text: string): readonly TurnItem[] => {
  const lines = splitLines(text);
  const range = findSection(lines, "あなたの番");
  if (range === undefined) {
    return [];
  }
  const turns: TurnItem[] = [];
  for (let index = range.start; index < range.end; index += 1) {
    const match = CHECKBOX_PATTERN.exec(lines[index] ?? "");
    if (match === null) {
      continue;
    }
    turns.push({
      line: index,
      isChecked: match[2] !== " ",
      label: match[3] ?? "",
    });
  }
  return turns;
};

/**
 * 「振り返り」節の本文を取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 前後の空行を除いた本文。節が無い、または空なら空文字列。
 */
export const extractReview = (text: string): string => extractSection(text, "振り返り");

/**
 * `## <name>` 節の本文を返す。見出しは先頭の語で判定する。
 *
 * @param text - Markdown ファイル全体。
 * @param name - 見出しの先頭の語。
 * @returns 前後の空行を除いた本文。節が無い、または空なら空文字列。
 */
export const extractSection = (text: string, name: string): string =>
  sectionLines(splitLines(text), name).join("\n").trim();

const extractFrontmatterValue = (text: string, key: string): string | undefined => {
  const lines = splitLines(text);
  const end = frontmatterEnd(lines);
  if (end === undefined) {
    return undefined;
  }
  const line = lines.slice(1, end).find((candidate) => candidate.startsWith(`${key}:`));
  const value = line?.slice(key.length + 1).trim();
  return value === undefined || value === "" ? undefined : value;
};

/**
 * frontmatter の `review_at` の値を取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 値。キーが無い、または空なら undefined。
 */
export const extractReviewAt = (text: string): string | undefined =>
  extractFrontmatterValue(text, "review_at");

/**
 * frontmatter の `wake_at` の値を取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 値。キーが無い、または空なら undefined。
 */
export const extractWakeAt = (text: string): string | undefined => extractFrontmatterValue(text, "wake_at");

/**
 * 画面表示に必要な内容をまとめて取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 時間割・チェック項目・振り返り・`review_at`・`wake_at`。
 */
export const parseDaily = (text: string): DailyView => ({
  schedule: extractSchedule(text),
  turns: extractTurns(text),
  review: extractReview(text),
  reviewAt: extractReviewAt(text),
  wakeAt: extractWakeAt(text),
});

/**
 * 「あなたの番」のチェック項目 1 つの状態を設定する。
 *
 * @param text - daily ファイル全体。
 * @param line - 対象の行番号(`TurnItem.line`)。
 * @param isChecked - true なら `[x]`、false なら `[ ]`。
 * @returns その行の `[ ]` / `[x]` だけを変えた全文。対象行がチェック項目でなければ元の全文。
 */
export const setTurnChecked = (text: string, line: number, isChecked: boolean): string => {
  const lines = splitLines(text);
  const target = lines[line];
  if (target === undefined) {
    return text;
  }
  const match = CHECKBOX_PATTERN.exec(target);
  if (match === null) {
    return text;
  }
  const replaced = `${match[1] ?? ""}[${isChecked ? "x" : " "}] ${match[3] ?? ""}`;
  return lines.map((current, index) => (index === line ? replaced : current)).join("\n");
};

/**
 * 「あなたの番」のチェック項目 1 つの状態を切り替える。
 *
 * @param text - daily ファイル全体。
 * @param line - 切り替える項目の行番号(`TurnItem.line`)。
 * @returns その行の `[ ]` / `[x]` だけを変えた全文。対象行がチェック項目でなければ元の全文。
 */
export const toggleTurn = (text: string, line: number): string => {
  const match = CHECKBOX_PATTERN.exec(splitLines(text)[line] ?? "");
  if (match === null) {
    return text;
  }
  return setTurnChecked(text, line, match[2] === " ");
};

/**
 * frontmatter の 1 つのキーを設定する。
 *
 * @param text - Markdown ファイル全体。
 * @param key - キー名。
 * @param value - 値。
 * @returns そのキーの行だけを変えた全文。キーが無ければ frontmatter の末尾に追加する。frontmatter が無ければ元の全文。
 */
export const setFrontmatterValue = (text: string, key: string, value: string): string => {
  const lines = splitLines(text);
  const end = frontmatterEnd(lines);
  if (end === undefined) {
    return text;
  }
  const line = `${key}: ${value}`;
  const existing = lines.findIndex(
    (candidate, index) => index > 0 && index < end && candidate.startsWith(`${key}:`),
  );
  if (existing !== -1) {
    return lines.map((current, index) => (index === existing ? line : current)).join("\n");
  }
  return [...lines.slice(0, end), line, ...lines.slice(end)].join("\n");
};

/**
 * frontmatter の `review_at` を設定する。
 *
 * @param text - daily ファイル全体。
 * @param reviewAt - ISO 8601 の日時。
 * @returns `review_at` の行だけを変えた全文。キーが無ければ frontmatter の末尾に追加する。frontmatter が無ければ元の全文。
 */
export const setReviewAt = (text: string, reviewAt: string): string =>
  setFrontmatterValue(text, "review_at", reviewAt);

/**
 * frontmatter の `wake_at` を設定する。
 *
 * @param text - daily ファイル全体。
 * @param wakeAt - ISO 8601 の日時。
 * @returns `wake_at` の行だけを変えた全文。キーが無ければ frontmatter の末尾に追加する。frontmatter が無ければ元の全文。
 */
export const setWakeAt = (text: string, wakeAt: string): string =>
  setFrontmatterValue(text, "wake_at", wakeAt);

/**
 * 「振り返り」節の本文を置き換える。
 *
 * @param text - daily ファイル全体。
 * @param review - 新しい本文。前後の空白は取り除く。
 * @returns 節の本文だけを変えた全文。見出しと前後の節は変えない。節が無ければ末尾に追加する。
 */
export const setReview = (text: string, review: string): string => replaceSection(text, "振り返り", review);

/**
 * `## <name>` 節の本文を置き換える。見出しは先頭の語で判定する。
 *
 * @param text - Markdown ファイル全体。
 * @param name - 見出しの先頭の語。節が無いときはこれを見出しにする。
 * @param body - 新しい本文。前後の空白は取り除く。
 * @returns 節の本文だけを変えた全文。見出しと前後の節は変えない。節が無ければ末尾に追加する。
 */
export const replaceSection = (text: string, name: string, body: string): string => {
  const lines = splitLines(text);
  const trimmed = body.trim();
  const bodyLines = trimmed === "" ? [] : trimmed.split("\n");
  const range = findSection(lines, name);
  if (range === undefined) {
    const base = text.trimEnd();
    const prefix = base === "" ? "" : `${base}\n\n`;
    return `${prefix}## ${name}\n\n${bodyLines.join("\n")}\n`;
  }
  // 見出しの直後と次の節の前に空行を 1 つずつ置く。最後の節ならファイル末尾は改行 1 つで終わる。
  const replacement = bodyLines.length === 0 ? [""] : ["", ...bodyLines, ""];
  return [...lines.slice(0, range.start), ...replacement, ...lines.slice(range.end)].join("\n");
};

/**
 * 朝ジョブが daily を作っていない日に、振り返りを書くための最小の daily を作る。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns frontmatter と「振り返り」節だけの全文。
 */
export const createMinimalDaily = (date: string): string =>
  ["---", `date: ${date}`, "plan_at:", "review_at:", "---", "", "## 振り返り", "", ""].join("\n");
