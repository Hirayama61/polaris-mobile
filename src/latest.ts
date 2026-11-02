/**
 * 読み込みの世代を数える箱。`useRef(0)` をそのまま渡せる。
 */
export type LatestRef = { current: number };

/**
 * 新しい読み込みを始める。それより前に始めた読み込みの応答は、以後「最新でない」になる。
 *
 * @param latest - 読み込みの世代。
 * @returns 応答が届いたときに、まだ最新かを返す関数。
 */
export const beginLatest = (latest: LatestRef): (() => boolean) => {
  latest.current += 1;
  const id = latest.current;
  return () => id === latest.current;
};

/**
 * 始めた読み込みの応答をすべて捨てる。アンマウントや、読む対象が変わったときに使う。
 *
 * @param latest - 読み込みの世代。
 */
export const cancelLatest = (latest: LatestRef): void => {
  latest.current += 1;
};
