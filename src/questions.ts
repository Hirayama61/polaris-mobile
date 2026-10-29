import { isSafeId, readFrontmatterValue } from "./projects";

/**
 * 「質問」タスク (`tasks/<id>.md`) の読み取りと「## 回答」節の書き換え。
 *
 * 書き換えてよいのは「## 回答」節の中身だけ。frontmatter を含む他の行は 1 文字も変えない。
 */

const TITLE_PREFIX = "質問:";

/**
 * 一覧に出す質問。
 */
export type QuestionItem = {
  id: string;
  title: string;
};

type Lines = { eol: string; lines: string[] };

const splitLines = (text: string): Lines => {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { eol, lines: text.split(eol) };
};

// 節は次の `#` か `##` の見出しで終わる。`###` 以下は節の中身として扱う。
const SECTION_END = /^#{1,2}(\s|$)/;
const FENCE_OPEN = /^(`{3,}|~{3,})/;

// 閉じたフェンスの中の行に印を付ける。閉じは開きと同じ文字で同じ長さ以上の行だけ (CommonMark)。
// 閉じていないフェンスは印を付けない。付けると後ろの見出しが全部フェンスの中になり、書き換えで消える。
const fencedLines = (lines: readonly string[]): boolean[] => {
  const fenced = lines.map(() => false);
  let open: { index: number; marker: string } | undefined;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (open === undefined) {
      const marker = FENCE_OPEN.exec(line)?.[1];
      if (marker !== undefined) {
        open = { index, marker };
      }
      continue;
    }
    const char = open.marker[0] ?? "";
    if (line.length >= open.marker.length && line === char.repeat(line.length)) {
      fenced.fill(true, open.index, index + 1);
      open = undefined;
    }
  }
  return fenced;
};

const findSection = (
  lines: readonly string[],
  heading: string,
): { start: number; end: number } | undefined => {
  const fenced = fencedLines(lines);
  let start = -1;
  for (const [index, raw] of lines.entries()) {
    if (fenced[index]) {
      continue;
    }
    const line = raw.trimEnd();
    if (start === -1) {
      if (line === `## ${heading}`) {
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
 * @param answer - 回答。前後の空白は落とす。
 * @returns 書き換えたファイル全体。
 */
export const replaceAnswer = (text: string, answer: string): string => {
  const { eol, lines } = splitLines(text);
  const trimmed = answer.trim();
  const body = trimmed === "" ? [] : trimmed.split(/\r?\n/).map((line) => line.trimEnd());
  const section = findSection(lines, "回答");
  if (section === undefined) {
    const base = text === "" || text.endsWith(eol) ? text : `${text}${eol}`;
    const separator = base === "" || base.endsWith(`${eol}${eol}`) ? "" : eol;
    return [`${base}${separator}## 回答`, "", ...body, ""].join(eol);
  }
  const replaced = body.length === 0 ? [""] : ["", ...body, ""];
  return [
    ...lines.slice(0, section.start + 1),
    ...replaced,
    ...lines.slice(section.end),
  ].join(eol);
};

/**
 * `tasks/` のファイル名から未回答の質問を集める。
 *
 * 読み込みは `limit` 件ずつ並べる。1 件でも読めなければ例外を投げる。
 *
 * @param names - `tasks/` 直下のファイル名。
 * @param read - task ID からファイルを読む関数。無ければ undefined。
 * @param limit - 同時に読む数。
 * @returns ID 順の質問。
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
      if (title !== undefined) {
        found.push({ id, title });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
  return found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};
