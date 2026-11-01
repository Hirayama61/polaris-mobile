/**
 * Git Trees API の応答を、パスから blob sha への対応に読み替える (純粋関数)。
 */

/**
 * リポジトリの全ファイルの blob sha。応答が切り詰められていたら `truncated`。
 */
export type RepoTree = { kind: "complete"; shas: ReadonlyMap<string, string> } | { kind: "truncated" };

type BlobEntry = { type: "blob"; path: string; sha: string };

const isBlobEntry = (entry: unknown): entry is BlobEntry => {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const source: Record<string, unknown> = { ...entry };
  const isBlob = source.type === "blob";
  const hasPath = typeof source.path === "string";
  const hasSha = typeof source.sha === "string";
  return isBlob && hasPath && hasSha;
};

const toShaPair = (entry: BlobEntry): [string, string] => [entry.path, entry.sha];

/**
 * `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` の応答を読む。
 *
 * @param body - 応答の JSON。
 * @returns `truncated` が真なら一部しか載っていないので `truncated`。
 */
export const toRepoTree = (body: unknown): RepoTree => {
  if (typeof body !== "object" || body === null) {
    return { kind: "complete", shas: new Map() };
  }
  const source: Record<string, unknown> = { ...body };
  const isTruncated = source.truncated === true;
  if (isTruncated) {
    return { kind: "truncated" };
  }
  const entries = Array.isArray(source.tree) ? source.tree : [];
  return { kind: "complete", shas: new Map(entries.filter(isBlobEntry).map(toShaPair)) };
};

/**
 * ディレクトリ直下のファイル名を返す。サブディレクトリの中は含めない。
 *
 * @param shas - `toRepoTree` の `shas`。
 * @param dir - リポジトリ内のディレクトリのパス。末尾の `/` は付けない。
 * @returns ファイル名。ディレクトリが無ければ空。
 */
export const getFileNamesIn = (shas: ReadonlyMap<string, string>, dir: string): string[] => {
  const prefix = `${dir}/`;
  return [...shas.keys()]
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((name) => !name.includes("/"));
};
