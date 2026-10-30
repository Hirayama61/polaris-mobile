import { isSafeId, readFrontmatterValue } from "./projects";

/**
 * `tasks/<id>.md` の節の読み取りと、「## 回答」節の書き換え、「## 疑問点」節への 1 行の追加。
 *
 * 書き換えてよいのは「## 回答」節の中身と、「## 疑問点」節に足す行だけ。frontmatter を含む他の行は 1 文字も変えない。
 */

const TITLE_PREFIX = "質問:";

/**
 * 一覧に出す質問。
 */
export type QuestionItem = {
  id: string;
  title: string;
  /** 「## 回答」に書いてあり、整理ループの反映を待っている。 */
  answered: boolean;
};

// 整理ループが質問を作るときに「## 回答」へ入れる文字。これだけなら未回答とみなす。
const UNANSWERED_PLACEHOLDER = "(未回答)";

type Lines = { eol: string; lines: string[] };

const splitLines = (text: string): Lines => {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { eol, lines: text.split(eol) };
};

// 節は次の `#` か `##` の見出しで終わる。`###` 以下は節の中身として扱う。
// 先頭 0〜3 個の空白がある見出しも見出し (CommonMark)。見落とすと後ろの節が回答として消える。
const SECTION_END = /^ {0,3}#{1,2}(\s|$)/;
// 開きも閉じも先頭の空白は 0〜3 個まで。4 個以上は字下げコードで、フェンスとみなすと間の見出しを見落とす。
// バッククォートの開きは、後ろにバッククォートを含む行を除く (```` ```foo``` ```` はインラインコード、CommonMark)。
const FENCE_OPEN = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})$/;

// 閉じたフェンスの中の行に印を付ける。閉じは開きと同じ文字で同じ長さ以上の行だけ (CommonMark)。
// 閉じていないフェンスは印を付けない。付けると後ろの見出しが全部フェンスの中になり、書き換えで消える。
const fencedLines = (lines: readonly string[]): boolean[] => {
  const fenced = lines.map(() => false);
  let open: { index: number; marker: string } | undefined;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (open === undefined) {
      const marker = FENCE_OPEN.exec(line)?.[1];
      if (marker !== undefined) {
        open = { index, marker };
      }
      continue;
    }
    const close = FENCE_CLOSE.exec(line)?.[1];
    if (close !== undefined && close[0] === open.marker[0] && close.length >= open.marker.length) {
      fenced.fill(true, open.index, index + 1);
      open = undefined;
    }
  }
  return fenced;
};

// 回答に書く行がフェンスや `#`/`##` 見出しになると、次の保存で節の境目がずれて後ろの節が消える。
// 先頭に `\` を足して、Markdown でも見た目の文字のまま、構造を変えない行にする。
const STRUCTURAL = /^(`{3,}|~{3,}|#{1,2}(\s|$))/;

const escapeStructural = (line: string): string => {
  const indent = line.length - line.trimStart().length;
  return STRUCTURAL.test(line.slice(indent)) ? `${line.slice(0, indent)}\\${line.slice(indent)}` : line;
};

// フェンスは節の始まりを探すときだけ見る。終わりはフェンスを見ず、最初の見出しらしい行で切る。
// フェンスの読み違いは終わりを後ろへずらし、書き換えで後ろの節を消す。見出しらしい行で切れば、誤っても節が短くなるだけで後ろの行は残る。
const findSection = (
  lines: readonly string[],
  heading: string,
): { start: number; end: number } | undefined => {
  const fenced = fencedLines(lines);
  let start = -1;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (start === -1) {
      if (!fenced[index] && line === `## ${heading}`) {
        start = index;
      }
    } else if (SECTION_END.test(line)) {
      return { start, end: index };
    }
  }
  return start === -1 ? undefined : { start, end: lines.length };
};

/**
 * ファイル名から task ID を取り出す。
 *
 * @param name - `tasks/` 直下のファイル名。
 * @returns `.md` でないか、ID に使えない文字を含めば undefined。
 */
export const taskIdOf = (name: string): string | undefined => {
  if (!name.endsWith(".md")) {
    return undefined;
  }
  const id = name.slice(0, -".md".length);
  return isSafeId(id) ? id : undefined;
};

/**
 * 未回答の質問タスクなら、一覧に出すタイトルを返す。
 *
 * @param text - タスクのファイル全体。
 * @returns `title` が `質問:` で始まり `status: todo` なら、接頭辞を外したタイトル。それ以外は undefined。
 */
export const openQuestionTitle = (text: string): string | undefined => {
  const title = readFrontmatterValue(text, "title");
  if (title === undefined || !title.startsWith(TITLE_PREFIX)) {
    return undefined;
  }
  if (readFrontmatterValue(text, "status") !== "todo") {
    return undefined;
  }
  const rest = title.slice(TITLE_PREFIX.length).trim();
  return rest === "" ? title : rest;
};

/**
 * `## <heading>` 節の中身を返す。
 *
 * @param text - タスクのファイル全体。
 * @param heading - 見出しの文字 (`##` を除く)。
 * @returns 前後の空行を除いた中身。節が無ければ undefined。
 */
export const extractSection = (text: string, heading: string): string | undefined => {
  const { lines } = splitLines(text);
  const section = findSection(lines, heading);
  if (section === undefined) {
    return undefined;
  }
  return lines
    .slice(section.start + 1, section.end)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};

/**
 * 「## 回答」節の中身を書き換える。
 *
 * 節があればその中身だけを置き換える。無ければファイルの末尾に足す。どちらでも他の行は変えない。
 *
 * @param text - タスクのファイル全体。
 * @param answer - 回答。前後の空白は落とす。フェンスや `#`/`##` 見出しになる行は先頭に `\` を足す。
 * @returns 書き換えたファイル全体。
 */
export const replaceAnswer = (text: string, answer: string): string => {
  const { eol, lines } = splitLines(text);
  const trimmed = answer.trim();
  const body = trimmed === "" ? [] : trimmed.split(/\r?\n/).map((line) => escapeStructural(line.trimEnd()));
  const section = findSection(lines, "回答");
  if (section === undefined) {
    const base = text === "" || text.endsWith(eol) ? text : `${text}${eol}`;
    const separator = base === "" || base.endsWith(`${eol}${eol}`) ? "" : eol;
    return [`${base}${separator}## 回答`, "", ...body, ""].join(eol);
  }
  const replaced = body.length === 0 ? [""] : ["", ...body, ""];
  return [...lines.slice(0, section.start + 1), ...replaced, ...lines.slice(section.end)].join(eol);
};

/**
 * 「## 疑問点」節に `- [ ] <doubt>` を 1 行足す。
 *
 * 節があれば節の最後の空でない行の次に足す。無ければファイルの末尾に節を作る。どちらでも既存の行は変えない。
 *
 * @param text - タスクのファイル全体。
 * @param doubt - 疑問点。改行は空白にし、前後の空白は落とす。
 * @returns 書き換えたファイル全体。疑問点が空なら受け取った内容をそのまま返す。
 */
export const addDoubt = (text: string, doubt: string): string => {
  const oneLine = doubt.replace(/\s+/g, " ").trim();
  if (oneLine === "") {
    return text;
  }
  // 整理ループは `- [ ]` の行だけを未回答として調べ、調べ終えると `- [x]` にする。
  const item = `- [ ] ${oneLine}`;
  const { eol, lines } = splitLines(text);
  const section = findSection(lines, "疑問点");
  if (section === undefined) {
    const base = text === "" || text.endsWith(eol) ? text : `${text}${eol}`;
    const separator = base === "" || base.endsWith(`${eol}${eol}`) ? "" : eol;
    return [`${base}${separator}## 疑問点`, "", item, ""].join(eol);
  }
  let last = section.end - 1;
  while (last > section.start && (lines[last] ?? "").trim() === "") {
    last -= 1;
  }
  if (last > section.start) {
    return [...lines.slice(0, last + 1), item, ...lines.slice(last + 1)].join(eol);
  }
  // 中身の無い節は見出しの次に空行を挟んで足す。直後が見出しなら後ろにも空行を足す。
  const next = lines[section.start + 1];
  const added = next === undefined || next.trim() === "" ? ["", item] : ["", item, ""];
  return [...lines.slice(0, section.start + 1), ...added, ...lines.slice(section.start + 1)].join(eol);
};

/**
 * 「## 疑問点」節の 1 行。
 *
 * `open` は `- [ ]` (未回答)、`done` は `- [x]` (調べ済み)、`other` はそれ以外の行。
 */
export type DoubtLine = {
  status: "open" | "done" | "other";
  text: string;
};

const DOUBT_ITEM = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;

/**
 * 「## 疑問点」節の中身を行ごとに分け、未回答と調べ済みを見分ける。
 *
 * @param section - `extractSection` で取り出した節の中身。
 * @returns 空行を除いた行。チェックボックスの行は印を外した本文を返す。
 */
export const parseDoubts = (section: string): DoubtLine[] =>
  section
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): DoubtLine => {
      const match = DOUBT_ITEM.exec(line);
      if (match === null) {
        return { status: "other", text: line.trim() };
      }
      return { status: match[1] === " " ? "open" : "done", text: (match[2] ?? "").trim() };
    });

/**
 * 「## 回答」に回答が書いてあるか。
 *
 * @param text - タスクのファイル全体。
 * @returns 節の中身が空でも `(未回答)` でもなければ true。
 */
export const hasAnswer = (text: string): boolean => {
  const answer = extractSection(text, "回答");
  return answer !== undefined && answer !== "" && answer !== UNANSWERED_PLACEHOLDER;
};

/**
 * `tasks/` のファイル名から未回答の質問を集める。
 *
 * 読み込みは `limit` 件ずつ並べる。1 件でも読めなければ例外を投げる。
 *
 * @param names - `tasks/` 直下のファイル名。
 * @param read - task ID からファイルを読む関数。無ければ undefined。
 * @param limit - 同時に読む数。
 * @returns 回答の無いものを先に、それぞれ ID 順に並べた質問。
 */
export const collectOpenQuestions = async (
  names: readonly string[],
  read: (id: string) => Promise<string | undefined>,
  limit = 6,
): Promise<QuestionItem[]> => {
  const ids = names.flatMap((name) => taskIdOf(name) ?? []).sort();
  const found: QuestionItem[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let id = ids[next]; id !== undefined; id = ids[next]) {
      next += 1;
      const text = await read(id);
      const title = text === undefined ? undefined : openQuestionTitle(text);
      if (text !== undefined && title !== undefined) {
        found.push({ id, title, answered: hasAnswer(text) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
  return found.sort((a, b) =>
    a.answered !== b.answered ? (a.answered ? 1 : -1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
};
