/**
 * `journal/YYYY-MM-DD.md` に日記を書く純粋関数。
 */

/**
 * 日記を追記した全文を作る。
 *
 * @param existing - 既存の全文。ファイルが無ければ undefined。
 * @param date - `YYYY-MM-DD`。新規作成時の frontmatter に使う。
 * @param entry - 追記する本文。前後の空白は取り除く。
 * @returns 無ければ frontmatter つきで新規作成した全文、あれば末尾に空行を挟んで追記した全文。
 */
export const appendJournal = (
  existing: string | undefined,
  date: string,
  entry: string,
): string => {
  const body = entry.trim();
  if (existing === undefined) {
    return `---\ndate: ${date}\n---\n\n${body}\n`;
  }
  return `${existing.trimEnd()}\n\n${body}\n`;
};
