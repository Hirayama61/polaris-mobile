/**
 * `tasks/<id>.md` の人のタスクの一覧と、「## あなたがやること」のチェックリストの書き換え。
 *
 * 書き換えてよいのは、チェックリストの行の `[ ]` / `[x]` と、完了にするときの frontmatter の `status` と `updated` だけ。
 */
import { readFrontmatterValue, SAFE_ID_PATTERN, type ListNames, type ReadText } from "./projects";

/**
 * 一覧に出す 1 件のタスク。
 */
export type HumanTask = {
  id: string;
  title: string;
  projectName: string | undefined;
};

/**
 * 「## あなたがやること」の 1 項目。`line` は 0 始まりの行番号。
 */
export type ChecklistItem = {
  line: number;
  label: string;
  isChecked: boolean;
};

const CHECKLIST_TITLE = "あなたがやること";
const CHECKBOX_PATTERN = /^(\s*[-*+]\s+\[)([ xX])(\](?:\s+(.*))?)$/;

const titleOf = (id: string, text: string): string => {
  const fromFrontmatter = readFrontmatterValue(text, "title");
  if (fromFrontmatter !== undefined) {
    return fromFrontmatter;
  }
  const heading = text.split("\n").find((line) => /^#\s+\S/.test(line));
  return heading?.replace(/^#\s+/, "").trim() ?? id;
};

/**
 * 一覧に出す人のタスクかを決める。
 *
 * @param text - `tasks/<id>.md` の全体。
 * @returns `assignee: human` かつ `status: todo` で、`title` が `質問:` で始まらないとき true。
 */
export const isHumanTodo = (text: string): boolean =>
  readFrontmatterValue(text, "assignee") === "human" &&
  readFrontmatterValue(text, "status") === "todo" &&
  !(readFrontmatterValue(text, "title") ?? "").startsWith("質問:");

/**
 * 人のタスクを project 名の順、同じ project の中はタイトル順に並べる。project の無いものは末尾。
 *
 * @param tasks - 並べるタスク。
 * @returns 新しい配列。
 */
export const sortHumanTasks = (tasks: readonly HumanTask[]): HumanTask[] =>
  [...tasks].sort(
    (a, b) =>
      Number(a.projectName === undefined) - Number(b.projectName === undefined) ||
      (a.projectName ?? "").localeCompare(b.projectName ?? "", "ja") ||
      a.title.localeCompare(b.title, "ja"),
  );

/**
 * `tasks/*.md` から人の todo を読み、`projects/<slug>.md` の `name` を付けて返す。読むだけで書かない。
 *
 * @param list - ディレクトリのファイル名を返す関数。
 * @param read - ファイルを読む関数。
 * @returns 並べた一覧。tasks のファイルを読めなければ例外。project 名を読めなければ名前なしにする。
 */
export const loadHumanTasks = async (list: ListNames, read: ReadText): Promise<HumanTask[]> => {
  const ids = (await list("tasks"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .filter((id) => SAFE_ID_PATTERN.test(id));
  const names = new Map<string, Promise<string | undefined>>();
  const projectNameOf = (slug: string | undefined): Promise<string | undefined> => {
    if (slug === undefined || !SAFE_ID_PATTERN.test(slug)) {
      return Promise.resolve(undefined);
    }
    const cached = names.get(slug);
    if (cached !== undefined) {
      return cached;
    }
    const pending = read(`projects/${slug}.md`)
      .then((text) => (text === undefined ? undefined : readFrontmatterValue(text, "name")))
      .catch(() => undefined);
    names.set(slug, pending);
    return pending;
  };
  const tasks = await Promise.all(
    ids.map(async (id): Promise<HumanTask | undefined> => {
      const text = await read(`tasks/${id}.md`);
      if (text === undefined || !isHumanTodo(text)) {
        return undefined;
      }
      const projectName = await projectNameOf(readFrontmatterValue(text, "project"));
      return { id, title: titleOf(id, text), projectName };
    }),
  );
  return sortHumanTasks(tasks.filter((task) => task !== undefined));
};

/**
 * 「## あなたがやること」節のチェックリストを取り出す。節は次の `#` / `##` 見出しで終わる。
 *
 * @param text - `tasks/<id>.md` の全体。
 * @returns 項目の並び。節が無ければ空。
 */
export const extractChecklist = (text: string): ChecklistItem[] => {
  const items: ChecklistItem[] = [];
  let isInSection = false;
  text.split("\n").forEach((raw, line) => {
    const trimmed = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading !== null) {
      if ((heading[1]?.length ?? 1) <= 2) {
        isInSection = heading[1] === "##" && (heading[2] ?? "").trim() === CHECKLIST_TITLE;
      }
      return;
    }
    if (!isInSection) {
      return;
    }
    const match = CHECKBOX_PATTERN.exec(trimmed);
    if (match !== null) {
      items.push({ line, label: (match[4] ?? "").trim(), isChecked: match[2] !== " " });
    }
  });
  return items;
};

/**
 * チェックリストの 1 項目のチェックを付ける / 外す。その行の `[ ]` / `[x]` の 1 文字だけを変える。
 *
 * @param text - `tasks/<id>.md` の全体。
 * @param line - `extractChecklist` の `line`。
 * @param isChecked - 付けるなら true。
 * @returns 書き換えた全体。節の項目でない行を指したときは受け取った内容をそのまま返す。
 */
export const setChecklistItem = (text: string, line: number, isChecked: boolean): string => {
  if (!extractChecklist(text).some((item) => item.line === line)) {
    return text;
  }
  const lines = text.split("\n");
  const target = lines[line] ?? "";
  // 行頭の `- [ ]` が最初の角括弧なので、最初の 1 つだけを置き換える。
  lines[line] = target.replace(/\[[ xX]\]/, isChecked ? "[x]" : "[ ]");
  return lines.join("\n");
};

/**
 * タスクを完了にする。frontmatter の `status` を `done`、`updated` を `now` にする。`updated` が無ければ `status` の次に足す。
 *
 * @param text - `tasks/<id>.md` の全体。
 * @param now - `+09:00` つきの ISO 8601。
 * @returns 書き換えた全体。frontmatter か `status` が無ければ受け取った内容をそのまま返す。
 */
export const completeTask = (text: string, now: string): string => {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "---") {
    return text;
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end === -1) {
    return text;
  }
  const indexOf = (key: string): number =>
    lines.findIndex((line, index) => index > 0 && index < end && line.startsWith(`${key}:`));
  const statusIndex = indexOf("status");
  if (statusIndex === -1) {
    return text;
  }
  // CRLF のファイルは行末の \r を残す。
  const eol = (line: string): string => (line.endsWith("\r") ? "\r" : "");
  const statusLine = lines[statusIndex] ?? "";
  lines[statusIndex] = `status: done${eol(statusLine)}`;
  const updatedIndex = indexOf("updated");
  if (updatedIndex === -1) {
    lines.splice(statusIndex + 1, 0, `updated: ${now}${eol(statusLine)}`);
  } else {
    const updatedLine = lines[updatedIndex] ?? "";
    const quote = /^updated:\s*(["'])/.exec(updatedLine)?.[1] ?? "";
    lines[updatedIndex] = `updated: ${quote}${now}${quote}${eol(updatedLine)}`;
  }
  return lines.join("\n");
};
