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
