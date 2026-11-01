/**
 * レート制限に当たったときの解除の見込み。
 *
 * `resetAt` はヘッダーから解除時刻を読めなかったとき `undefined`。
 */
export type RateLimit = { resetAt: Date | undefined };

const NO_RATE_LIMIT = undefined;

const SECOND_MS = 1000;

const readSeconds = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds;
};

const getResetAt = (headers: Headers, now: Date): Date | undefined => {
  const retryAfter = readSeconds(headers.get("retry-after"));
  if (retryAfter !== undefined) {
    return new Date(now.getTime() + retryAfter * SECOND_MS);
  }
  const reset = readSeconds(headers.get("x-ratelimit-reset"));
  if (reset !== undefined) {
    return new Date(reset * SECOND_MS);
  }
  return undefined;
};

/**
 * GitHub の応答がレート制限によるものかを見分け、解除時刻を読む。
 *
 * GitHub はレート制限を 429 か、`x-ratelimit-remaining: 0` 付きの 403 で返す。
 * `retry-after` (秒数) があれば `x-ratelimit-reset` (UNIX 秒) より優先する。
 *
 * @param status - HTTP ステータス。
 * @param headers - 応答ヘッダー。
 * @param now - 応答を受けた時刻。`retry-after` の起点。
 * @returns レート制限でなければ `undefined`。
 */
export const getRateLimit = (status: number, headers: Headers, now: Date): RateLimit | undefined => {
  const isExhausted = headers.get("x-ratelimit-remaining") === "0";
  const isRateLimited = status === 429 || (status === 403 && isExhausted);
  if (!isRateLimited) {
    return NO_RATE_LIMIT;
  }
  return { resetAt: getResetAt(headers, now) };
};
