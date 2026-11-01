/**
 * blob sha から本文へのキャッシュ。sha が同じなら本文も同じなので、読み直さずに済む。
 *
 * localStorage に 1 件 1 キーで置き、使った順の sha の並びを別のキーに持つ。
 * 件数が上限を超えたら、長く使っていないものから捨てる。
 */

const BLOB_PREFIX = "polaris-mobile:blob:";
const ORDER_KEY = "polaris-mobile:blob-order";

/**
 * 残す件数の上限。tasks/ (約 150 件) と受信箱・ブログ・プロジェクトを合わせても収まる数。
 */
export const BLOB_CACHE_LIMIT = 500;

/**
 * 容量超過で書けなかったときに、まとめて捨てる件数。
 */
const EVICT_ON_QUOTA = 50;

/**
 * `sha` を最後に使ったものとして並びの末尾に移す。
 *
 * @param order - 古い順の sha。
 * @param sha - 使った sha。
 * @returns 新しい並び。
 */
export const getTouchedOrder = (order: readonly string[], sha: string): string[] => [
  ...order.filter((item) => item !== sha),
  sha,
];

/**
 * 上限を超えた分の、古い方の sha を返す。
 *
 * @param order - 古い順の sha。
 * @param limit - 残す件数。
 * @returns 捨てる sha。超えていなければ空。
 */
export const getEvictedShas = (order: readonly string[], limit: number): string[] =>
  order.slice(0, Math.max(0, order.length - limit));

const loadOrder = (): string[] => {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const saveOrder = (order: readonly string[], limit: number): void => {
  const evicted = getEvictedShas(order, limit);
  for (const sha of evicted) {
    localStorage.removeItem(BLOB_PREFIX + sha);
  }
  localStorage.setItem(ORDER_KEY, JSON.stringify(order.slice(evicted.length)));
};

/**
 * キャッシュから本文を読む。
 *
 * @param sha - blob sha。
 * @returns 無ければ undefined。
 */
export const loadBlob = (sha: string): string | undefined => {
  try {
    const content = localStorage.getItem(BLOB_PREFIX + sha);
    if (content === null) {
      return undefined;
    }
    saveOrder(getTouchedOrder(loadOrder(), sha), BLOB_CACHE_LIMIT);
    return content;
  } catch {
    return undefined;
  }
};

/**
 * 本文をキャッシュに置く。容量が足りなければ古いものを捨てて 1 回だけやり直す。
 *
 * @param sha - blob sha。
 * @param content - 本文。
 */
export const saveBlob = (sha: string, content: string): void => {
  const order = getTouchedOrder(loadOrder(), sha);
  try {
    localStorage.setItem(BLOB_PREFIX + sha, content);
    saveOrder(order, BLOB_CACHE_LIMIT);
  } catch {
    try {
      saveOrder(order, Math.max(0, order.length - EVICT_ON_QUOTA));
      localStorage.setItem(BLOB_PREFIX + sha, content);
    } catch {
      // 置けなくても読み直せば済むので、表示には影響しない。
    }
  }
};
