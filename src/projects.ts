/**
 * 「あなたの番」の task ID からプロジェクト名を引く。
 *
 * `tasks/<id>.md` の frontmatter `project` (slug) から `projects/<slug>.md` の `name` を読む。読むだけで書かない。
 */

// ID は path に埋め込むので、`..` や `/` で別のファイルを指せないよう文字を限る。
export const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * path に埋め込んでよい ID か。
 *
 * @param id - task ID やプロジェクトの slug。
 * @returns 英数字で始まり、英数字と `_` `-` だけなら true。
 */
export const isSafeId = (id: string): boolean => SAFE_ID_PATTERN.test(id);

/**
 * frontmatter から 1 つのキーの値を取り出す。
 *
 * @param text - Markdown ファイル全体。
 * @param key - キー名。
 * @returns 値。前後の引用符は外す。frontmatter かキーが無い、または空なら undefined。
 */
export const readFrontmatterValue = (text: string, key: string): string | undefined => {
  const lines = text.split("\n").map((line) => line.trimEnd());
  if (lines[0] !== "---") {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) {
    return undefined;
  }
  const prefix = `${key}:`;
  const line = lines.slice(1, end).find((candidate) => candidate.startsWith(prefix));
  const raw = line?.slice(prefix.length).trim();
  if (raw === undefined) {
    return undefined;
  }
  const value = /^(["'])(.*)\1$/.exec(raw)?.[2] ?? raw;
  return value.trim() === "" ? undefined : value.trim();
};

/**
 * ファイルを読む関数。無いか読めなければ undefined を返す。読み込みの失敗は例外で返してよい。
 */
export type ReadText = (path: string) => Promise<string | undefined>;

/**
 * task ID からプロジェクト名を引く関数を作る。
 *
 * 同じパスは 1 回だけ読む。失敗 (例外) したパスは覚えず、次に呼ばれたときに読み直す。
 *
 * @param read - ファイルを読む関数。
 * @returns task ID を受け取り、プロジェクト名 (引けなければ undefined) を返す関数。例外は投げない。
 */
export const createProjectNameLoader = (
  read: ReadText,
): ((taskId: string) => Promise<string | undefined>) => {
  const cache = new Map<string, Promise<string | undefined>>();
  const readOnce = (path: string): Promise<string | undefined> => {
    const cached = cache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const pending = read(path).catch((error: unknown) => {
      cache.delete(path);
      throw error;
    });
    cache.set(path, pending);
    return pending;
  };
  const frontmatterValueOf = async (kind: string, id: string, key: string): Promise<string | undefined> => {
    if (!isSafeId(id)) {
      return undefined;
    }
    const text = await readOnce(`${kind}/${id}.md`);
    return text === undefined ? undefined : readFrontmatterValue(text, key);
  };
  return async (taskId) => {
    try {
      const slug = await frontmatterValueOf("tasks", taskId, "project");
      return slug === undefined ? undefined : await frontmatterValueOf("projects", slug, "name");
    } catch {
      return undefined;
    }
  };
};

/**
 * 一覧に出す 1 件のプロジェクト。
 */
export type ProjectSummary = {
  slug: string;
  name: string;
  isRetired: boolean;
  status: string | undefined;
  kind: string | undefined;
  github: string | undefined;
  body: string;
};

/**
 * 本文の行の一部。`link` はブラウザで開く。
 */
export type Segment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

/**
 * 本文の 1 行を表示用に分けたもの。
 */
export type ProjectLine =
  | { kind: "heading"; level: number; segments: Segment[] }
  | { kind: "item"; segments: Segment[] }
  | { kind: "text"; segments: Segment[] }
  | { kind: "blank" };

// `github:` の値を URL に埋め込むので、owner/name の形だけを受け付ける。
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ISSUE_SECTION_TITLE = "Issue の状況";
// PR の URL は github.com のものだけをリンクにする。javascript: などを開かせないため。
const ISSUE_LINK_PATTERN = /\(PR: (https:\/\/github\.com\/[^\s)]+)\)|(?<![\w#/&])#(\d+)(?!\w)/g;

/**
 * frontmatter を除いた本文を返す。frontmatter が無ければ全体を返す。
 *
 * @param text - Markdown ファイル全体。
 * @returns 本文。先頭の空行は除く。
 */
export const stripFrontmatter = (text: string): string => {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "---") {
    return text;
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end === -1) {
    return text;
  }
  return lines
    .slice(end + 1)
    .join("\n")
    .replace(/^(\s*\r?\n)+/, "");
};

/**
 * `projects/<slug>.md` の内容を一覧の 1 件にする。
 *
 * @param slug - ファイル名から `.md` を除いたもの。
 * @param text - ファイル全体。
 * @returns `name` が無ければ slug を名前にする。
 */
export const parseProject = (slug: string, text: string): ProjectSummary => {
  const github = readFrontmatterValue(text, "github");
  const status = readFrontmatterValue(text, "status");
  return {
    slug,
    name: readFrontmatterValue(text, "name") ?? slug,
    isRetired: status === "retired",
    status,
    kind: readFrontmatterValue(text, "kind"),
    github: github !== undefined && GITHUB_REPO_PATTERN.test(github) ? github : undefined,
    body: stripFrontmatter(text),
  };
};

/**
 * 終了したもの (`status: retired`) を末尾に回し、それぞれを名前順に並べる。
 *
 * @param projects - 並べるプロジェクト。
 * @returns 新しい配列。
 */
export const sortProjects = (projects: readonly ProjectSummary[]): ProjectSummary[] =>
  [...projects].sort(
    (a, b) => Number(a.isRetired) - Number(b.isRetired) || a.name.localeCompare(b.name, "ja"),
  );

/**
 * 「Issue の状況」の行の `#N` と `(PR: URL)` をリンクに分ける。
 *
 * @param text - 1 行。
 * @param github - frontmatter の `github` (owner/name)。無ければ `#N` は文字のまま。
 * @returns 文字とリンクの並び。
 */
export const linkifyIssueRefs = (text: string, github: string | undefined): Segment[] => {
  const segments: Segment[] = [];
  let rest = 0;
  const pushText = (value: string): void => {
    const last = segments.at(-1);
    if (value === "") {
      return;
    }
    if (last?.kind === "text") {
      last.text += value;
    } else {
      segments.push({ kind: "text", text: value });
    }
  };
  for (const match of text.matchAll(ISSUE_LINK_PATTERN)) {
    const [whole, prUrl, issueNumber] = match;
    if (prUrl !== undefined) {
      pushText(text.slice(rest, match.index));
      pushText("(PR: ");
      segments.push({ kind: "link", text: prUrl, href: prUrl });
      pushText(")");
    } else if (issueNumber !== undefined && github !== undefined) {
      pushText(text.slice(rest, match.index));
      segments.push({
        kind: "link",
        text: whole,
        href: `https://github.com/${github}/issues/${issueNumber}`,
      });
    } else {
      continue;
    }
    rest = match.index + whole.length;
  }
  pushText(text.slice(rest));
  return segments;
};

/**
 * 本文を行ごとの表示用の形にする。リンクにするのは「## Issue の状況」節の中だけ。
 *
 * @param body - frontmatter を除いた本文。
 * @param github - frontmatter の `github` (owner/name)。
 * @returns 行の並び。
 */
export const parseProjectBody = (body: string, github: string | undefined): ProjectLine[] => {
  let isIssueSection = false;
  return body
    .replace(/\s+$/, "")
    .split("\n")
    .map((raw): ProjectLine => {
      const line = raw.trimEnd();
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading !== null) {
        const level = heading[1]?.length ?? 1;
        const title = heading[2] ?? "";
        if (level <= 2) {
          isIssueSection = level === 2 && title.trim() === ISSUE_SECTION_TITLE;
        }
        return { kind: "heading", level, segments: [{ kind: "text", text: title }] };
      }
      if (line.trim() === "") {
        return { kind: "blank" };
      }
      const segmentsOf = (text: string): Segment[] =>
        isIssueSection ? linkifyIssueRefs(text, github) : [{ kind: "text", text }];
      const item = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (item !== null) {
        return { kind: "item", segments: segmentsOf(item[1] ?? "") };
      }
      return { kind: "text", segments: segmentsOf(line) };
    });
};

/**
 * `projects/` のファイル名を返す関数。ディレクトリが無ければ空。
 */
export type ListNames = (path: string) => Promise<readonly string[]>;

/**
 * `projects/*.md` を読んで、並べた一覧を返す。読むだけで書かない。
 *
 * @param list - ディレクトリのファイル名を返す関数。
 * @param read - ファイルを読む関数。
 * @returns 終了したものを末尾にした一覧。読めなかったファイルがあれば例外。
 */
export const loadProjects = async (list: ListNames, read: ReadText): Promise<ProjectSummary[]> => {
  const slugs = (await list("projects"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .filter((slug) => SAFE_ID_PATTERN.test(slug));
  const projects = await Promise.all(
    slugs.map(async (slug) => {
      const text = await read(`projects/${slug}.md`);
      return text === undefined ? undefined : parseProject(slug, text);
    }),
  );
  return sortProjects(projects.filter((project) => project !== undefined));
};
