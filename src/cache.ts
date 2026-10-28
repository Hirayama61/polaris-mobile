/**
 * オフライン表示用に、最後に読んだファイルを localStorage に残す。
 */

const PREFIX = "polaris-mobile:cache:";

/**
 * キャッシュしたファイル。
 */
export type CachedFile = {
  content: string;
  sha: string;
  fetchedAt: string;
};

/**
 * 保存済みのファイルを読む。
 *
 * @param path - リポジトリ内のパス。
 * @returns 無ければ undefined。
 */
export const loadCachedFile = (path: string): CachedFile | undefined => {
  try {
    const raw = localStorage.getItem(PREFIX + path);
    if (raw === null) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    const source: Record<string, unknown> = { ...parsed };
    const { content, sha, fetchedAt } = source;
    if (
      typeof content !== "string" ||
      typeof sha !== "string" ||
      typeof fetchedAt !== "string"
    ) {
      return undefined;
    }
    return { content, sha, fetchedAt };
  } catch {
    return undefined;
  }
};

/**
 * ファイルを保存する。
 *
 * @param path - リポジトリ内のパス。
 * @param file - 保存する内容。
 */
export const saveCachedFile = (path: string, file: CachedFile): void => {
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify(file));
  } catch {
    // 容量超過などで保存できなくても表示には影響しない。
  }
};

/**
 * ファイルのキャッシュを消す。リモートで 404 だったときに使う。
 *
 * @param path - リポジトリ内のパス。
 */
export const removeCachedFile = (path: string): void => {
  localStorage.removeItem(PREFIX + path);
};
