import { formatTokyoTime } from "./clock";
import { GitHubError } from "./github";
import type { RateLimit } from "./rateLimit";

/**
 * 失敗を利用者に見せるための説明。
 *
 * `action` は次の一手。`settings` なら設定画面へ、`retry` ならその場でやり直す。
 */
export type Failure = {
  reason: string;
  hint: string;
  action: "settings" | "retry";
};

const RATE_LIMITED_REASON = "GitHub の読み取りの上限に当たりました。";

const describeRateLimit = (rateLimit: RateLimit): Failure => {
  const { resetAt } = rateLimit;
  if (resetAt === undefined) {
    return {
      reason: RATE_LIMITED_REASON,
      hint: "しばらく待ってからもう一度試してください。",
      action: "retry",
    };
  }
  const resetLabel = formatTokyoTime(resetAt);
  return {
    reason: `${RATE_LIMITED_REASON}${resetLabel} に解除されます。`,
    hint: "解除されたらもう一度試してください。",
    action: "retry",
  };
};

/**
 * 例外を、理由と次の一手に変える。
 *
 * @param error - GitHub への読み書きで起きた例外。
 * @returns レート制限は解除時刻とやり直しを、401 / 403 / 404 はトークンや設定の見直しを、それ以外はやり直しを促す。
 */
export const describeFailure = (error: unknown): Failure => {
  if (!(error instanceof GitHubError)) {
    const reason = error instanceof Error ? error.message : String(error);
    return { reason, hint: "もう一度試してください。", action: "retry" };
  }
  if (error.rateLimit !== undefined) {
    return describeRateLimit(error.rateLimit);
  }
  switch (error.status) {
    case 0:
      return {
        reason: "GitHub に接続できませんでした。",
        hint: "電波のよい場所でもう一度試してください。",
        action: "retry",
      };
    case 401:
      return {
        reason: "トークンが無効か、期限が切れています。",
        hint: "設定でトークンを入れ直してください。",
        action: "settings",
      };
    case 403:
      return {
        reason: "トークンにこの操作の権限がありません。",
        hint: "GitHub でトークンの権限を確かめてください。",
        action: "settings",
      };
    case 404:
      return {
        reason: "リポジトリが見つかりません。",
        hint: "設定のリポジトリ名と、トークンの対象リポジトリを確かめてください。",
        action: "settings",
      };
    default:
      return { reason: error.message, hint: "少し待ってからもう一度試してください。", action: "retry" };
  }
};
