/**
 * 書きかけの入力を localStorage に残す。タブの切り替えやアプリの再起動で消えないようにする。
 */

const PREFIX = "polaris-mobile:draft:";

/**
 * 書きかけを読む。
 *
 * @param key - 入力欄ごとの鍵。日付を含めると日をまたいだ取り違えを防げる。
 * @returns 無ければ undefined。
 */
export const loadDraft = (key: string): string | undefined => {
  try {
    return localStorage.getItem(PREFIX + key) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * 書きかけを保存する。空文字列なら消す。
 *
 * @param key - 入力欄ごとの鍵。
 * @param value - 入力中の値。
 */
export const saveDraft = (key: string, value: string): void => {
  try {
    if (value === "") {
      localStorage.removeItem(PREFIX + key);
      return;
    }
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // 保存できなくても入力は画面に残る。
  }
};

/**
 * 書きかけを消す。送信や保存が済んだときに使う。
 *
 * @param key - 入力欄ごとの鍵。
 */
export const removeDraft = (key: string): void => {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // 消せなくても次の保存で上書きされる。
  }
};

/**
 * 夜の画面の書きかけの鍵を作る。
 *
 * 日付ごとに分けるので、4:00 をまたいで「今日」が変わっても前日の書きかけは前日の鍵に残り、当日の保存に混ざらない。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns 振り返りと日記の鍵。
 */
export const nightDraftKeys = (date: string): { review: string; journal: string } => ({
  review: `review:${date}`,
  journal: `journal:${date}`,
});

/**
 * 今日の画面の投稿欄の書きかけの鍵を作る。
 *
 * 日付ごとに分けるので、送らずに 4:00 をまたいだ前日の書きかけは当日の投稿欄に出ず、当日の journal に混ざらない。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns 投稿欄の鍵。
 */
export const postDraftKey = (date: string): string => `post:${date}`;

/**
 * 保存が済んだあとに入力欄に残す内容を決める。
 *
 * @param current - 保存が済んだ時点の入力。
 * @param saved - 保存した入力。
 * @returns 同じなら undefined(消してよい)、保存中に書き換えられていれば `current`。
 */
export const remainingAfterSave = (current: string, saved: string): string | undefined =>
  current === saved ? undefined : current;
