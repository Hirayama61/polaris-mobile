/**
 * 受信箱に並べる `tasks/` のタスクと質問。読むだけで書かない。
 *
 * @remarks 回答とチェックの書き換えは持たない。開いた先のシート (`QuestionSheet` / `TasksSheet`) が持つ。
 */
import { type ListNames, type ReadText, readFrontmatterValue } from "./projects";
import { hasAnswer, openQuestionTitle } from "./questions";
import { createProjectSlugNameReader, isHumanTodo, listTaskIds, titleOf } from "./tasks";

/**
 * 受信箱の 1 件。質問は `openQuestionTitle` の、タスクは `isHumanTodo` の範囲。
 */
export type InboxItem =
  | {
      kind: "question";
      id: string;
      title: string;
      /** 「## 回答」に書いてあり、整理ループの反映を待っている。 */
      answered: boolean;
      projectName: string | undefined;
      created: string | undefined;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      projectName: string | undefined;
      created: string | undefined;
    };

/**
 * 受信箱の見出し 1 つ分。`projectName` が undefined なら project の無いもの。
 */
export type InboxGroup = {
  projectName: string | undefined;
  items: InboxItem[];
};

// union の各型から project 名を外す。`Omit<InboxItem, ...>` だと共通のキーだけが残る。
type WithoutProjectName<T> = T extends unknown ? Omit<T, "projectName"> : never;

/** project の無いものの見出し。 */
export const NO_PROJECT_LABEL = "プロジェクトなし";

/**
 * 1 件のタスクのファイルを受信箱の 1 件にする。project 名はまだ付けない。
 *
 * @param id - task ID。
 * @param text - `tasks/<id>.md` の全体。
 * @returns 受信箱に出さないものは undefined。
 */
export const toInboxItem = (id: string, text: string): WithoutProjectName<InboxItem> | undefined => {
  const created = readFrontmatterValue(text, "created");
  const questionTitle = openQuestionTitle(text);
  if (questionTitle !== undefined) {
    return { kind: "question", id, title: questionTitle, answered: hasAnswer(text), created };
  }
  if (isHumanTodo(text)) {
    return { kind: "task", id, title: titleOf(id, text), created };
  }
  return undefined;
};

const kindOrder = (item: InboxItem): number => {
  if (item.kind === "task") {
    return 2;
  }
  return item.answered ? 1 : 0;
};

const compareItems = (a: InboxItem, b: InboxItem): number =>
  kindOrder(a) - kindOrder(b) || a.title.localeCompare(b.title, "ja");

/**
 * project ごとに見出しを分ける。見出しは project 名の順で、project の無いものは末尾。
 * 見出しの中は未回答の質問、回答済みの質問、タスクの順で、それぞれタイトル順。
 *
 * @param items - 受信箱の全件。
 * @returns 新しい配列。
 */
export const groupInboxByProject = (items: readonly InboxItem[]): InboxGroup[] => {
  const names = [...new Set(items.map((item) => item.projectName))].sort(
    (a, b) => Number(a === undefined) - Number(b === undefined) || (a ?? "").localeCompare(b ?? "", "ja"),
  );
  return names.map((projectName) => ({
    projectName,
    items: items.filter((item) => item.projectName === projectName).sort(compareItems),
  }));
};

/**
 * 前に受信箱を開いた時刻より後に作られたか。
 *
 * @param created - frontmatter の `created`。
 * @param seenAt - 前に受信箱を開いた時刻。初めて開くときは undefined。
 * @returns どちらかが無いか読めない日時なら false。
 */
export const isNewSince = (created: string | undefined, seenAt: string | undefined): boolean => {
  if (created === undefined || seenAt === undefined) {
    return false;
  }
  const createdAt = Date.parse(created);
  const seen = Date.parse(seenAt);
  return !Number.isNaN(createdAt) && !Number.isNaN(seen) && createdAt > seen;
};

/**
 * 未回答の質問があるか。タブの「!」に使う。
 *
 * @param items - 受信箱の全件。
 * @returns 「## 回答」が空の質問が 1 件でもあれば true。
 */
export const hasUnansweredQuestion = (items: readonly InboxItem[]): boolean =>
  items.some((item) => item.kind === "question" && !item.answered);

/**
 * `tasks/*.md` から受信箱の全件を読み、`projects/<slug>.md` の `name` を付けて返す。
 *
 * @param list - ディレクトリのファイル名を返す関数。
 * @param read - ファイルを読む関数。
 * @returns 全件。tasks のファイルを読めなければ例外。project 名を読めなければ名前なしにする。
 */
export const loadInbox = async (list: ListNames, read: ReadText): Promise<InboxItem[]> => {
  const ids = await listTaskIds(list);
  const projectNameOf = createProjectSlugNameReader(read);
  const items = await Promise.all(
    ids.map(async (id): Promise<InboxItem | undefined> => {
      const text = await read(`tasks/${id}.md`);
      const item = text === undefined ? undefined : toInboxItem(id, text);
      if (text === undefined || item === undefined) {
        return undefined;
      }
      const projectName = await projectNameOf(readFrontmatterValue(text, "project"));
      return { ...item, projectName };
    }),
  );
  return items.filter((item) => item !== undefined);
};
