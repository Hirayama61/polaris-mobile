import { GitHubError } from "./github";

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

/**
 * 例外を、理由と次の一手に変える。
 *
 * @param error - GitHub への読み書きで起きた例外。
 * @returns 401 / 403 / 404 はトークンや設定の見直しを、それ以外はやり直しを促す。
 */
export const describeFailure = (error: unknown): Failure => {
  if (!(error instanceof GitHubError)) {
    const reason = error instanceof Error ? error.message : String(error);
    return { reason, hint: "もう一度試してください。", action: "retry" };
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
