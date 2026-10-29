/**
 * daily ファイル(Markdown + frontmatter)を読み書きする純粋関数。
 *
 * 朝ジョブと夜ジョブも同じファイルを書くため、ここで変更してよいのは
 * 「あなたの番」のチェック状態・「振り返り」の本文・frontmatter の `review_at` と `wake_at`・
 * 時間割の「実績」列のセルだけ。それ以外の行は 1 文字も変えない。
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
  const closing = lines.findIndex(
    (line, index) => index > 0 && line === FRONTMATTER_DELIMITER,
  );
  return closing === -1 ? undefined : closing;
};

// 見出しは括弧つきの揺れ(「あなたの番 (3 つまで)」)があるので先頭の語で判定する。
const findSection = (
  lines: readonly string[],
  name: string,
): SectionRange | undefined => {
  const bodyStart = (frontmatterEnd(lines) ?? -1) + 1;
  const headingLine = lines.findIndex(
    (line, index) =>
      index >= bodyStart &&
      line.startsWith(HEADING_PREFIX) &&
      line.slice(HEADING_PREFIX.length).trimStart().startsWith(name),
  );
  if (headingLine === -1) {
    return undefined;
  }
  const nextHeading = lines.findIndex(
    (line, index) => index > headingLine && line.startsWith(HEADING_PREFIX),
  );
  return {
    headingLine,
    start: headingLine + 1,
    end: nextHeading === -1 ? lines.length : nextHeading,
  };
};

const sectionLines = (
  lines: readonly string[],
  name: string,
): readonly string[] => {
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

const isSeparatorRow = (cells: readonly string[]): boolean =>
  cells.every((cell) => /^:?-+:?$/.test(cell));

const ACTUAL_HEADER = "実績";

type ScheduleTable = {
  rows: readonly { line: number; cells: readonly string[] }[];
  /** 「実績」列の位置。列が無ければ undefined。 */
  actualColumn: number | undefined;
};

const findScheduleTable = (lines: readonly string[]): ScheduleTable => {
  const range = findSection(lines, "今日の時間割");
  if (range === undefined) {
    return { rows: [], actualColumn: undefined };
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
  const value = actual.replace(/\s+/g, " ").replace(/\|/g, "｜").trim();
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
export const extractReview = (text: string): string =>
  sectionLines(splitLines(text), "振り返り").join("\n").trim();

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
export const extractWakeAt = (text: string): string | undefined =>
  extractFrontmatterValue(text, "wake_at");

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
export const setTurnChecked = (
  text: string,
  line: number,
  isChecked: boolean,
): string => {
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
  return lines
    .map((current, index) => (index === line ? replaced : current))
    .join("\n");
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

const setFrontmatterValue = (text: string, key: string, value: string): string => {
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
    return lines
      .map((current, index) => (index === existing ? line : current))
      .join("\n");
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
export const setReview = (text: string, review: string): string => {
  const lines = splitLines(text);
  const body = review.trim();
  const bodyLines = body === "" ? [] : body.split("\n");
  const range = findSection(lines, "振り返り");
  if (range === undefined) {
    const base = text.trimEnd();
    const prefix = base === "" ? "" : `${base}\n\n`;
    return `${prefix}## 振り返り\n\n${bodyLines.join("\n")}\n`;
  }
  // 見出しの直後と次の節の前に空行を 1 つずつ置く。最後の節ならファイル末尾は改行 1 つで終わる。
  const replacement = bodyLines.length === 0 ? [""] : ["", ...bodyLines, ""];
  return [
    ...lines.slice(0, range.start),
    ...replacement,
    ...lines.slice(range.end),
  ].join("\n");
};

/**
 * 朝ジョブが daily を作っていない日に、振り返りを書くための最小の daily を作る。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns frontmatter と「振り返り」節だけの全文。
 */
export const createMinimalDaily = (date: string): string =>
  ["---", `date: ${date}`, "plan_at:", "review_at:", "---", "", "## 振り返り", "", ""].join(
    "\n",
  );
