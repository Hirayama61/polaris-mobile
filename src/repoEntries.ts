/**
 * 他のリポジトリの Issues API と Pulls API の応答の判定と変換。I/O を持たない。
 */

/**
 * 他のリポジトリの Issue の 1 件。PR は含めない。
 */
export type RepoIssue = { number: number; title: string; closedAt: string | undefined };

/**
 * 他のリポジトリの open の Issue の 1 件。PR は含めない。
 */
export type RepoOpenIssue = { number: number; title: string; labels: string[] };

/**
 * Issues API の応答の 1 件のうち、読むキーだけ。
 */
export type IssueEntry = { number: number; title: string; closed_at?: unknown; labels?: unknown };

/**
 * Pulls API の応答の 1 件のうち、head のブランチ名だけ。
 */
export type PullEntry = { head: { ref: string } };

/**
 * Pulls API の応答の 1 件のうち、マージ日時だけ。
 */
export type MergedPullEntry = { merged_at: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Issues API の応答の 1 件が Issue か。Issues API は PR も返すので、`pull_request` を持つものは除く。
 *
 * @param entry - 応答の配列の 1 件。
 * @returns `number` と `title` を持つ Issue なら true。
 */
export const isIssueEntry = (entry: unknown): entry is IssueEntry => {
  if (!isRecord(entry)) {
    return false;
  }
  const isPull = "pull_request" in entry;
  const hasNumber = typeof entry.number === "number";
  const hasTitle = typeof entry.title === "string";
  return !isPull && hasNumber && hasTitle;
};

/**
 * Pulls API の応答の 1 件が head のブランチ名を持つか。
 *
 * @param entry - 応答の配列の 1 件。
 * @returns `head.ref` が文字列なら true。
 */
export const hasHeadRef = (entry: unknown): entry is PullEntry => {
  if (!isRecord(entry) || !isRecord(entry.head)) {
    return false;
  }
  const hasRef = typeof entry.head.ref === "string";
  return hasRef;
};

/**
 * Issue の閉じた日時。
 *
 * @param entry - Issue。
 * @returns `closed_at` が文字列ならその値、そうでなければ undefined。
 */
export const getClosedAt = (entry: IssueEntry): string | undefined => {
  const { closed_at: closedAt } = entry;
  const hasClosedAt = typeof closedAt === "string";
  if (!hasClosedAt) {
    return undefined;
  }
  return closedAt;
};

const toRepoIssue = (entry: IssueEntry): RepoIssue => ({
  number: entry.number,
  title: entry.title,
  closedAt: getClosedAt(entry),
});

/**
 * Issues API の応答を Issue の一覧にする。
 *
 * @param body - 応答の本文。
 * @returns PR を除いた Issue。本文が配列でなければ空。
 */
export const toRepoIssues = (body: unknown): RepoIssue[] => {
  if (!Array.isArray(body)) {
    return [];
  }
  return body.filter(isIssueEntry).map(toRepoIssue);
};

const toLabelName = (label: unknown): string | undefined => {
  if (!isRecord(label)) {
    return undefined;
  }
  const { name } = label;
  const hasName = typeof name === "string";
  if (!hasName) {
    return undefined;
  }
  return name;
};

/**
 * Issue のラベル名。
 *
 * @param entry - Issue。
 * @returns 名前が文字列のラベルだけ。`labels` が配列でなければ空。
 */
export const getLabelNames = (entry: IssueEntry): string[] => {
  const { labels } = entry;
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels.map(toLabelName).filter((name) => name !== undefined);
};

/**
 * Issue をラベル付きの Issue にする。
 *
 * @param entry - Issue。
 * @returns 番号、題名、ラベル名。
 */
export const toRepoOpenIssue = (entry: IssueEntry): RepoOpenIssue => ({
  number: entry.number,
  title: entry.title,
  labels: getLabelNames(entry),
});

/**
 * Pulls API の応答の 1 件がマージ済みか。
 *
 * @param entry - 応答の配列の 1 件。
 * @returns `merged_at` が文字列なら true。
 */
export const hasMergedAt = (entry: unknown): entry is MergedPullEntry => {
  if (!isRecord(entry)) {
    return false;
  }
  const isMerged = typeof entry.merged_at === "string";
  return isMerged;
};
