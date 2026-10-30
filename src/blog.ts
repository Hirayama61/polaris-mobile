/**
 * ブログの執筆の流れ (polaris-data の `writing/blog/`) を読み書きする純粋関数。
 *
 * 1 本の記事は 4 つのフォルダで同じファイル名 (id) を持つ。書き換えてよいのは
 * outline と draft の「## 一言」節と、draft の frontmatter の `status` と `url` だけ。
 */
import { extractSection, replaceSection, setFrontmatterValue } from "./daily";
import { type ListNames, type ReadText, readFrontmatterValue, SAFE_ID_PATTERN } from "./projects";

const BLOG_ROOT = "writing/blog";
const COMMENT_SECTION = "一言";
const MARKDOWN_EXTENSION = ".md";
const FRONTMATTER_PATTERN = /^---\n(?:[\s\S]*?\n)?---(\n|$)/;
const TITLE_HEADING_PATTERN = /^#\s+(.+)$/m;

/**
 * 執筆の段階のフォルダ。並びは段階が進む順。
 */
export const BLOG_FOLDERS = ["ideas", "outline", "draft", "published"] as const;

export type BlogFolder = (typeof BLOG_FOLDERS)[number];

/**
 * 1 本の記事のフォルダごとの本文。そのフォルダに無ければキーが無い。
 */
export type BlogFiles = Partial<Record<BlogFolder, string>>;

/**
 * 記事の段階。
 */
export type BlogStage = "needsComment" | "drafting" | "needsDraft" | "needsOutline" | "published";

/**
 * 段階の表示名。並びは一覧で上に出す順 (人の手が要るものが先)。
 */
export const BLOG_STAGE_LABELS = {
  needsComment: "一言待ち",
  drafting: "下書き",
  needsDraft: "下書き待ち",
  needsOutline: "構成待ち",
  published: "公開",
} satisfies Record<BlogStage, string>;

const STAGE_ORDER = Object.keys(BLOG_STAGE_LABELS) as BlogStage[];

/**
 * 一覧の 1 件。
 */
export type BlogPost = {
  id: string;
  title: string;
  stage: BlogStage;
  files: BlogFiles;
};

/**
 * 記事のファイルのパスを返す。
 *
 * @param folder - 段階のフォルダ。
 * @param id - ファイル名から `.md` を除いたもの。`isSafeId` を満たすこと。
 * @returns リポジトリ内のパス。
 */
export const toBlogPath = (folder: BlogFolder, id: string): string =>
  `${BLOG_ROOT}/${folder}/${id}${MARKDOWN_EXTENSION}`;

/**
 * 「## 一言」節の本文を返す。
 *
 * @param text - outline か draft のファイル全体。
 * @returns 前後の空行を除いた本文。節が無い、または空なら空文字列。
 */
export const extractComment = (text: string): string => extractSection(text, COMMENT_SECTION);

/**
 * 「## 一言」節の本文を置き換える。
 *
 * @param text - outline か draft のファイル全体。
 * @param comment - 新しい本文。前後の空白は取り除く。
 * @returns 節の本文だけを変えた全文。節が無ければ末尾に追加する。
 */
export const setComment = (text: string, comment: string): string =>
  replaceSection(text, COMMENT_SECTION, comment);

/**
 * draft を公開済みにする。
 *
 * @param text - draft のファイル全体。
 * @param url - 公開した記事の URL。
 * @returns frontmatter の `status` を `done` に、`url` を設定した全文。frontmatter が無ければ先頭に作る。
 */
export const publishDraft = (text: string, url: string): string => {
  const hasFrontmatter = FRONTMATTER_PATTERN.test(text);
  let base = text;
  if (!hasFrontmatter) {
    base = `---\n---\n\n${text}`;
  }
  return setFrontmatterValue(setFrontmatterValue(base, "status", "done"), "url", url);
};

/**
 * 公開した記事の URL として受け付けてよいか。
 *
 * @param value - 入力された文字列。
 * @returns http か https の絶対 URL なら true。
 */
export const isPublicUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!URL.canParse(trimmed)) {
    return false;
  }
  const { protocol } = new URL(trimmed);
  return protocol === "https:" || protocol === "http:";
};

/**
 * 記事の段階を決める。
 *
 * @param files - フォルダごとの本文。
 * @returns published にあるか draft が `status: done` なら公開。draft があれば下書き。
 *   outline があれば「## 一言」が空かで一言待ちか下書き待ち。ideas だけなら構成待ち。
 */
export const getBlogStage = (files: BlogFiles): BlogStage => {
  const { outline, draft, published } = files;
  const isDraftDone = draft !== undefined && readFrontmatterValue(draft, "status") === "done";
  if (published !== undefined || isDraftDone) {
    return "published";
  }
  if (draft !== undefined) {
    return "drafting";
  }
  if (outline === undefined) {
    return "needsOutline";
  }
  const hasComment = extractComment(outline) !== "";
  if (hasComment) {
    return "needsDraft";
  }
  return "needsComment";
};

/**
 * いちばん進んだ段階のフォルダを返す。本文の表示に使う。
 *
 * @param files - フォルダごとの本文。
 * @returns 本文のあるフォルダ。どれにも無ければ undefined。
 */
export const getLatestFolder = (files: BlogFiles): BlogFolder | undefined =>
  [...BLOG_FOLDERS].reverse().find((folder) => files[folder] !== undefined);

/**
 * いちばん進んだ段階の本文を返す。
 *
 * @param files - フォルダごとの本文。
 * @returns 本文。どのフォルダにも無ければ undefined。
 */
export const getLatestText = (files: BlogFiles): string | undefined => {
  const folder = getLatestFolder(files);
  if (folder === undefined) {
    return undefined;
  }
  return files[folder];
};

/**
 * 「## 一言」を書けるフォルダを返す。
 *
 * @param post - 記事。
 * @returns 公開前なら draft、無ければ outline。どちらも無いか公開済みなら undefined。
 */
export const getCommentFolder = (post: BlogPost): "draft" | "outline" | undefined => {
  const { stage, files } = post;
  if (stage === "published") {
    return undefined;
  }
  if (files.draft !== undefined) {
    return "draft";
  }
  if (files.outline !== undefined) {
    return "outline";
  }
  return undefined;
};

/**
 * 記事の題を返す。
 *
 * @param id - 記事の id。
 * @param files - フォルダごとの本文。
 * @returns いちばん進んだファイルの frontmatter の `title`、無ければ最初の `# ` 見出し、それも無ければ id。
 */
export const getBlogTitle = (id: string, files: BlogFiles): string => {
  const text = getLatestText(files);
  if (text === undefined) {
    return id;
  }
  const fromFrontmatter = readFrontmatterValue(text, "title");
  if (fromFrontmatter !== undefined) {
    return fromFrontmatter;
  }
  return TITLE_HEADING_PATTERN.exec(text.replace(FRONTMATTER_PATTERN, ""))?.[1]?.trim() ?? id;
};

/**
 * 人の手が要る段階を先に、同じ段階では id の新しい順 (降順) に並べる。
 *
 * @param posts - 並べる記事。
 * @returns 新しい配列。
 */
export const sortBlogPosts = (posts: readonly BlogPost[]): BlogPost[] =>
  [...posts].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.id.localeCompare(a.id),
  );

const toId = (name: string): string => name.slice(0, -MARKDOWN_EXTENSION.length);

const toIds = (names: readonly string[]): string[] =>
  names
    .filter((name) => name.endsWith(MARKDOWN_EXTENSION))
    .map(toId)
    .filter((id) => SAFE_ID_PATTERN.test(id));

/**
 * `writing/blog/` の 4 つのフォルダを読み、id で束ねた一覧を返す。読むだけで書かない。
 *
 * @param list - ディレクトリのファイル名を返す関数。
 * @param read - ファイルを読む関数。
 * @returns 並べた一覧。読めなかったファイルがあれば例外。
 */
export const loadBlogPosts = async (list: ListNames, read: ReadText): Promise<BlogPost[]> => {
  const idsByFolder = await Promise.all(
    BLOG_FOLDERS.map(async (folder) => ({ folder, ids: toIds(await list(`${BLOG_ROOT}/${folder}`)) })),
  );
  const ids = [...new Set(idsByFolder.flatMap(({ ids: folderIds }) => folderIds))];
  const posts = await Promise.all(
    ids.map(async (id): Promise<BlogPost> => {
      const entries = await Promise.all(
        idsByFolder
          .filter(({ ids: folderIds }) => folderIds.includes(id))
          .map(async ({ folder }) => [folder, await read(toBlogPath(folder, id))] as const),
      );
      const files: BlogFiles = Object.fromEntries(entries.filter(([, text]) => text !== undefined));
      return { id, title: getBlogTitle(id, files), stage: getBlogStage(files), files };
    }),
  );
  // 一覧を取った後に消えたファイルしか無い記事は出さない。
  return sortBlogPosts(posts.filter((post) => getLatestFolder(post.files) !== undefined));
};
