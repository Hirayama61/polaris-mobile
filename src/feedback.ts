/**
 * 要望を GitHub Issue として送るための純粋関数。
 */

/**
 * `owner/repo` を分けた結果。
 */
export type RepoSlug = {
  owner: string;
  repo: string;
};

const SLUG_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)$/;

/**
 * `owner/repo` の文字列を分ける。
 *
 * @param slug - 例: `Hirayama61/polaris-mobile`。前後の空白は無視する。
 * @returns 形式が正しければ owner と repo、違えば undefined。
 */
export const parseRepoSlug = (slug: string): RepoSlug | undefined => {
  const match = SLUG_PATTERN.exec(slug.trim());
  const owner = match?.[1];
  const repo = match?.[2];
  if (owner === undefined || repo === undefined || repo === "." || repo === "..") {
    return undefined;
  }
  return { owner, repo };
};

/**
 * Issue 本文の末尾に足す送信元の情報。
 */
export type FeedbackContext = {
  screenLabel: string;
  date: string;
  version: string;
};

/**
 * Issue の本文を組み立てる。
 *
 * @param body - 利用者が書いた本文。空でもよい。前後の空白は取り除く。
 * @param context - 送信元の画面・日付・アプリのバージョン。
 * @returns 本文の後に空行を挟み、送信元を 1 行足した文字列。本文が空なら送信元の 1 行だけ。
 */
export const buildIssueBody = (body: string, context: FeedbackContext): string => {
  const footer = `送信元: ${context.screenLabel} / ${context.date} / v${context.version}`;
  const trimmed = body.trim();
  return trimmed === "" ? footer : `${trimmed}\n\n${footer}`;
};
