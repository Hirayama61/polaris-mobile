/**
 * `journal/YYYY-MM-DD.md` に日記を書く純粋関数。
 */

/**
 * journal のパスを作る。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns `journal/YYYY-MM-DD.md`。
 */
export const journalPath = (date: string): string => `journal/${date}.md`;

/**
 * 日記を追記した全文を作る。
 *
 * @param existing - 既存の全文。ファイルが無ければ undefined。
 * @param date - `YYYY-MM-DD`。新規作成時の frontmatter に使う。
 * @param entry - 追記する本文。前後の空白は取り除く。
 * @returns 無ければ frontmatter つきで新規作成した全文、あれば末尾に空行を挟んで追記した全文。
 */
export const appendJournal = (existing: string | undefined, date: string, entry: string): string => {
  const body = entry.trim();
  if (existing === undefined) {
    return `---\ndate: ${date}\n---\n\n${body}\n`;
  }
  return `${existing.trimEnd()}\n\n${body}\n`;
};

/**
 * 日記の投稿 1 件。`time` は `HH:MM`。
 */
export type JournalPost = {
  time: string;
  text: string;
};

const POST_LINE = /^- (\d{2}:\d{2}) (.+)$/;

/**
 * 投稿を 1 行にする。改行や連続する空白は 1 つの空白にまとめる。
 *
 * @param time - `HH:MM`。
 * @param text - 本文。
 * @returns `- HH:MM 本文`。
 */
export const formatPost = (time: string, text: string): string =>
  `- ${time} ${text.replace(/\s+/g, " ").trim()}`;

/**
 * 投稿を 1 行追記した全文を作る。既存の行は変えない。
 *
 * @param existing - 既存の全文。ファイルが無ければ undefined。
 * @param date - `YYYY-MM-DD`。新規作成時の frontmatter に使う。
 * @param time - `HH:MM`。
 * @param text - 本文。
 * @returns 直前の行が投稿なら続けて、それ以外なら空行を挟んで追記した全文。
 */
export const appendPost = (
  existing: string | undefined,
  date: string,
  time: string,
  text: string,
): string => {
  const line = formatPost(time, text);
  if (existing === undefined) {
    return `---\ndate: ${date}\n---\n\n${line}\n`;
  }
  const kept = existing.trimEnd();
  const lastLine = kept.slice(kept.lastIndexOf("\n") + 1);
  return `${kept}${POST_LINE.test(lastLine) ? "\n" : "\n\n"}${line}\n`;
};

/**
 * 全文から投稿を書いた順に取り出す。
 *
 * @param content - journal の全文。
 * @returns `- HH:MM 本文` の行だけ。夜に書いた段落は含めない。
 */
export const extractPosts = (content: string): JournalPost[] =>
  content.split("\n").flatMap((line) => {
    const match = POST_LINE.exec(line.trimEnd());
    return match === null ? [] : [{ time: match[1] ?? "", text: match[2] ?? "" }];
  });
