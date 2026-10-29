/**
 * 思いつきを polaris-data の inbox に書くための純粋関数。
 */

/**
 * 本文の末尾に足す送信元の情報。
 */
export type FeedbackContext = {
  screenLabel: string;
  date: string;
  version: string;
};

/**
 * 思いつきの書きかけ。タイトルと本文。
 */
export type FeedbackDraft = {
  title: string;
  body: string;
};

const SUFFIX_LENGTH = 4;

/**
 * inbox のファイル名の末尾に付ける base36 の 4 文字を作る。
 *
 * @param random - 0 以上 1 未満を返す関数。
 * @returns `0-9a-z` の 4 文字。
 */
export const inboxSuffix = (random: () => number): string => {
  let suffix = "";
  for (let index = 0; index < SUFFIX_LENGTH; index += 1) {
    suffix += Math.min(35, Math.floor(random() * 36)).toString(36);
  }
  return suffix;
};

/**
 * inbox に作るファイルのパスを決める。
 *
 * @param created - +09:00 つきの ISO 8601。日付部分をファイル名に使う。
 * @param suffix - `inboxSuffix` で作った 4 文字。
 * @returns 例: `inbox/20261030-a7k2.md`。
 */
export const buildInboxPath = (created: string, suffix: string): string =>
  `inbox/${created.slice(0, 10).replaceAll("-", "")}-${suffix}.md`;

/**
 * inbox に書くファイルの内容を組み立てる。
 *
 * @param draft - 書いたタイトルと本文。前後の空白は取り除く。
 * @param context - 送信元の画面・日付・アプリのバージョン。
 * @param created - +09:00 つきの ISO 8601。frontmatter の `created` になる。
 * @returns frontmatter の後に、タイトル、本文、送信元の 1 行を空行で区切って並べた文字列。本文が空なら本文の段落を省く。
 */
export const buildInboxNote = (
  draft: FeedbackDraft,
  context: FeedbackContext,
  created: string,
): string => {
  const footer = `送信元: ${context.screenLabel} / ${context.date} / v${context.version}`;
  const paragraphs = [draft.title.trim(), draft.body.trim(), footer].filter((part) => part !== "");
  return `---\ncreated: ${created}\n---\n\n${paragraphs.join("\n\n")}\n`;
};

/**
 * 送信が済んだあとに残す書きかけを決める。
 *
 * 送信中に書き足された、または別の内容に書き換えられた書きかけは消さない。
 *
 * @param current - 送信が済んだ時点の書きかけ。
 * @param sent - 送信した書きかけ。
 * @returns `current` が `sent` と同じなら空、違えば `current` をそのまま返す。
 */
export const clearSentDraft = (current: FeedbackDraft, sent: FeedbackDraft): FeedbackDraft =>
  current.title === sent.title && current.body === sent.body ? { title: "", body: "" } : current;
