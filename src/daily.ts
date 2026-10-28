/**
 * daily ファイル(Markdown + frontmatter)を読み書きする純粋関数。
 *
 * 朝ジョブと夜ジョブも同じファイルを書くため、ここで変更してよいのは
 * 「あなたの番」のチェック状態・「振り返り」の本文・frontmatter の `review_at` だけ。
 * それ以外の行は 1 文字も変えない。
 */

/**
 * 「今日の時間割」の表の 1 行。
 */
export type ScheduleRow = {
  time: string;
  what: string;
  who: string;
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

/**
 * 「今日の時間割」の表を行ごとに取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns ヘッダーと区切り行を除いた表の行。表が無ければ空配列。
 */
export const extractSchedule = (text: string): readonly ScheduleRow[] => {
  const rows = sectionLines(splitLines(text), "今日の時間割")
    .map(parseTableRow)
    .filter((cells): cells is readonly string[] => cells !== undefined);
  // 先頭行はヘッダー。
  return rows
    .slice(1)
    .filter((cells) => !isSeparatorRow(cells))
    .map((cells) => ({
      time: cells[0] ?? "",
      what: cells[1] ?? "",
      who: cells[2] ?? "",
    }));
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

/**
 * frontmatter の `review_at` の値を取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 値。キーが無い、または空なら undefined。
 */
export const extractReviewAt = (text: string): string | undefined => {
  const lines = splitLines(text);
  const end = frontmatterEnd(lines);
  if (end === undefined) {
    return undefined;
  }
  const line = lines
    .slice(1, end)
    .find((candidate) => candidate.startsWith("review_at:"));
  const value = line?.slice("review_at:".length).trim();
  return value === undefined || value === "" ? undefined : value;
};

/**
 * 画面表示に必要な内容をまとめて取り出す。
 *
 * @param text - daily ファイル全体。
 * @returns 時間割・チェック項目・振り返り・`review_at`。
 */
export const parseDaily = (text: string): DailyView => ({
  schedule: extractSchedule(text),
  turns: extractTurns(text),
  review: extractReview(text),
  reviewAt: extractReviewAt(text),
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

/**
 * frontmatter の `review_at` を設定する。
 *
 * @param text - daily ファイル全体。
 * @param reviewAt - ISO 8601 の日時。
 * @returns `review_at` の行だけを変えた全文。キーが無ければ frontmatter の末尾に追加する。frontmatter が無ければ元の全文。
 */
export const setReviewAt = (text: string, reviewAt: string): string => {
  const lines = splitLines(text);
  const end = frontmatterEnd(lines);
  if (end === undefined) {
    return text;
  }
  const line = `review_at: ${reviewAt}`;
  const existing = lines.findIndex(
    (candidate, index) =>
      index > 0 && index < end && candidate.startsWith("review_at:"),
  );
  if (existing !== -1) {
    return lines
      .map((current, index) => (index === existing ? line : current))
      .join("\n");
  }
  return [...lines.slice(0, end), line, ...lines.slice(end)].join("\n");
};

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
