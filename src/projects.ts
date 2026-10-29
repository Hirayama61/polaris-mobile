/**
 * 「あなたの番」の task ID からプロジェクト名を引く。
 *
 * `tasks/<id>.md` の frontmatter `project` (slug) から `projects/<slug>.md` の `name` を読む。読むだけで書かない。
 */

// ID は path に埋め込むので、`..` や `/` で別のファイルを指せないよう文字を限る。
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

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
  const valueOf = async (kind: string, id: string, key: string): Promise<string | undefined> => {
    if (!isSafeId(id)) {
      return undefined;
    }
    const text = await readOnce(`${kind}/${id}.md`);
    return text === undefined ? undefined : readFrontmatterValue(text, key);
  };
  return async (taskId) => {
    try {
      const slug = await valueOf("tasks", taskId, "project");
      return slug === undefined ? undefined : await valueOf("projects", slug, "name");
    } catch {
      return undefined;
    }
  };
};
