/**
 * レート制限に当たったときの解除の見込み。
 *
 * `resetAt` はヘッダーから解除時刻を読めなかったとき `undefined`。
 */
export type RateLimit = { resetAt: Date | undefined };

const NO_RATE_LIMIT = undefined;

const SECOND_MS = 1000;

/** GitHub がレート制限に当たったときに返すステータス。出どころは GitHub REST API の "Rate limits" の節。 */
const STATUS_TOO_MANY_REQUESTS = 429;

/** レート制限でも権限不足でも GitHub が返すステータス。`x-ratelimit-remaining` で見分ける。 */
const STATUS_FORBIDDEN = 403;

/** 残りのリクエスト数を使い切ったときの `x-ratelimit-remaining` の値。 */
const NO_REMAINING = "0";

const MISSING_HEADER = null;

const NO_SECONDS = undefined;

/** `retry-after` と `x-ratelimit-reset` が取りうる最小の秒数。負の値は壊れたヘッダーとして捨てる。 */
const MIN_SECONDS = 0;

const readSeconds = (value: string | null): number | undefined => {
  const isMissing = value === MISSING_HEADER || value.trim() === "";
  if (isMissing) {
    return NO_SECONDS;
  }
  const seconds = Number(value);
  const isValidSeconds = Number.isFinite(seconds) && seconds >= MIN_SECONDS;
  if (!isValidSeconds) {
    return NO_SECONDS;
  }
  return seconds;
};

const getResetAt = (headers: Headers, now: Date): Date | undefined => {
  const retryAfter = readSeconds(headers.get("retry-after"));
  const hasRetryAfter = retryAfter !== NO_SECONDS;
  if (hasRetryAfter) {
    return new Date(now.getTime() + retryAfter * SECOND_MS);
  }
  const reset = readSeconds(headers.get("x-ratelimit-reset"));
  const hasReset = reset !== NO_SECONDS;
  if (hasReset) {
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
  const isExhausted = headers.get("x-ratelimit-remaining") === NO_REMAINING;
  const isTooManyRequests = status === STATUS_TOO_MANY_REQUESTS;
  const isForbidden = status === STATUS_FORBIDDEN;
  const isRateLimited = isTooManyRequests || (isForbidden && isExhausted);
  if (!isRateLimited) {
    return NO_RATE_LIMIT;
  }
  return { resetAt: getResetAt(headers, now) };
};
