/**
 * Asia/Tokyo 基準の日付と時刻。
 */

const TOKYO_OFFSET_MINUTES = 9 * 60;

// 端末のタイムゾーンに依存しないよう、UTC に +09:00 を足して東京の壁時計を得る。
const toTokyoWallClock = (now: Date): Date =>
  new Date(now.getTime() + TOKYO_OFFSET_MINUTES * 60 * 1000);

const pad = (value: number): string => String(value).padStart(2, "0");

const formatDate = (wallClock: Date): string =>
  `${wallClock.getUTCFullYear()}-${pad(wallClock.getUTCMonth() + 1)}-${pad(wallClock.getUTCDate())}`;

/**
 * Polaris 上の「今日」を求める。
 *
 * 0:00〜4:00 の間は前日を「今日」とする(夜更かし対応)。
 *
 * @param now - 現在時刻。
 * @returns `YYYY-MM-DD`(Asia/Tokyo)。
 */
export const polarisToday = (now: Date): string => {
  const wallClock = toTokyoWallClock(now);
  if (wallClock.getUTCHours() < 4) {
    return formatDate(new Date(wallClock.getTime() - 24 * 60 * 60 * 1000));
  }
  return formatDate(wallClock);
};

/**
 * 現在時刻を +09:00 つきの ISO 8601 で表す。
 *
 * @param now - 現在時刻。
 * @returns 例: `2026-10-30T22:15:00+09:00`。秒まで。
 */
export const formatTokyoIso = (now: Date): string => {
  const wallClock = toTokyoWallClock(now);
  return `${formatDate(wallClock)}T${pad(wallClock.getUTCHours())}:${pad(wallClock.getUTCMinutes())}:${pad(wallClock.getUTCSeconds())}+09:00`;
};
