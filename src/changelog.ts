export type ChangelogEntry = {
  hash: string;
  date: string;
  subject: string;
};

/** `git log` の 1 行の区切り。件名に出てこない制御文字を使う。 */
export const CHANGELOG_FIELD_SEPARATOR = "\x1f";

/** ビルド時に渡す `git log` の `--format`。並びは parseChangelog と揃える。 */
export const CHANGELOG_GIT_FORMAT = "%h%x1f%cs%x1f%s";

/** 履歴に入れるパス。CI だけの変更はアプリの更新ではないので外す。 */
export const CHANGELOG_PATHS = ["src", "public", "index.html", "package.json", "vite.config.ts"] as const;

/**
 * `git log --format=CHANGELOG_GIT_FORMAT` の出力を新しい順の配列にする。形の崩れた行は捨てる。
 */
export const parseChangelog = (raw: string): ChangelogEntry[] =>
  raw.split(/\r?\n/).flatMap((line) => {
    const [hash, date, ...rest] = line.split(CHANGELOG_FIELD_SEPARATOR);
    const subject = rest.join(CHANGELOG_FIELD_SEPARATOR).trim();
    if (hash === undefined || date === undefined || !/^[0-9a-f]{4,40}$/.test(hash) || subject === "") {
      return [];
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return [];
    }
    return [{ hash, date, subject }];
  });

/**
 * 「設定」に出す版。履歴があれば先頭の識別子を添え、履歴の先頭と一致させる。
 */
export const formatAppVersion = (packageVersion: string, entries: readonly ChangelogEntry[]): string => {
  const head = entries[0];
  return head === undefined ? `v${packageVersion}` : `v${packageVersion} · ${head.hash}`;
};
