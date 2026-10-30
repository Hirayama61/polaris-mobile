/**
 * 前に受信箱を開いた時刻を localStorage に残す。「新着」の基準にする。
 */

const KEY = "polaris-mobile:inbox:seen-at";

/**
 * 前に受信箱を開いた時刻を読む。
 *
 * @returns `+09:00` つきの ISO 8601。初めて開くときか読めなければ undefined。
 */
export const loadInboxSeenAt = (): string | undefined => {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * 受信箱を開いた時刻を残す。
 *
 * @param seenAt - `+09:00` つきの ISO 8601。
 */
export const saveInboxSeenAt = (seenAt: string): void => {
  try {
    localStorage.setItem(KEY, seenAt);
  } catch {
    // 残せなければ次に開いたときも同じものが新着に出るだけ。
  }
};
