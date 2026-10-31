/** 対応表 (`e2e/ledger.json`) の 1 行。1 つの書き込み操作と、それを確かめる E2E。 */
export type LedgerEntry = {
  file: string;
  operation: string;
  e2e: readonly LedgerTest[];
  pending?: true;
};

/** 担当の E2E。`test` は spec の `test("…")` の名前そのもの。 */
export type LedgerTest = {
  spec: string;
  test: string;
};

/** 対応表の対象にする `src/github.ts` の書き込み関数。読み取りは対象にしない。 */
export const WRITE_FUNCTIONS = ["updateFile", "writeKnownFile", "writeIfUnchanged", "createFile"] as const;

const WRITE_CALL = new RegExp(`\\b(?:${WRITE_FUNCTIONS.join("|")})\\(`);
const TEST_NAME = /\btest\(\s*"((?:[^"\\]|\\.)*)"/g;

/** ソースが書き込み関数を呼んでいるか。 */
export const isWriteCaller = (source: string): boolean => WRITE_CALL.test(source);

/** spec の `test("…")` の名前を並べる。 */
export const getTestNames = (spec: string): string[] =>
  [...spec.matchAll(TEST_NAME)].map((match) => JSON.parse(`"${match[1]}"`) as string);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLedgerTest = (value: unknown): value is LedgerTest =>
  isRecord(value) && typeof value.spec === "string" && typeof value.test === "string";

const isLedgerEntry = (value: unknown): value is LedgerEntry =>
  isRecord(value) &&
  typeof value.file === "string" &&
  typeof value.operation === "string" &&
  Array.isArray(value.e2e) &&
  value.e2e.every(isLedgerTest) &&
  (value.pending === undefined || value.pending === true);

/**
 * JSON を対応表として読む。形が合わなければ例外を投げる。
 *
 * @remarks ファイルは読まない。読むのは `check-ledger.ts`。
 */
export const parseLedger = (json: unknown): LedgerEntry[] => {
  const isLedger = Array.isArray(json) && json.every(isLedgerEntry);
  if (!isLedger) {
    throw new Error(
      "e2e/ledger.json は { file, operation, e2e: [{ spec, test }], pending? } の配列にしてください",
    );
  }
  return json;
};

/** spec が見つからないときの中身。テスト名は 1 つも無い扱いにする。 */
const MISSING_SPEC = "";

const hasTest = (specs: ReadonlyMap<string, string>, item: LedgerTest): boolean => {
  const spec = specs.get(item.spec) ?? MISSING_SPEC;
  return getTestNames(spec).includes(item.test);
};

const getEntryErrors = (
  entry: LedgerEntry,
  sources: ReadonlyMap<string, string>,
  specs: ReadonlyMap<string, string>,
): string[] => {
  const source = sources.get(entry.file);
  const label = `${entry.file} (${entry.operation})`;
  const isMissing = source === undefined;
  const isNotCaller = !isMissing && !isWriteCaller(source);
  const hasNoTest = entry.pending !== true && entry.e2e.length === 0;
  const fileErrors = [
    { isBroken: isMissing, message: `${label}: ファイルが無い` },
    { isBroken: isNotCaller, message: `${label}: 書き込み関数を呼んでいない` },
    { isBroken: hasNoTest, message: `${label}: pending でないのに担当の E2E が無い` },
  ]
    .filter((check) => check.isBroken)
    .map((check) => check.message);
  const testErrors = entry.e2e
    .filter((item) => !hasTest(specs, item))
    .map((item) => `${label}: ${item.spec} にテスト「${item.test}」が無い`);
  return [...fileErrors, ...testErrors];
};

/**
 * 対応表とソース・spec を照らし合わせ、食い違いを並べる。空なら合っている。
 *
 * @remarks E2E の中身が操作を確かめているかは判定しない。名前の一致だけを見る。
 * @param sources 照合する src のファイル (パス → 中身)。`src/github.ts` やテストを除くのは呼ぶ側。
 * @param specs e2e の spec (パス → 中身)。
 */
export const checkLedger = (
  ledger: readonly LedgerEntry[],
  sources: ReadonlyMap<string, string>,
  specs: ReadonlyMap<string, string>,
): string[] => {
  const listed = new Set(ledger.map((entry) => entry.file));
  const unlistedErrors = [...sources]
    .filter(([path, source]) => isWriteCaller(source) && !listed.has(path))
    .map(([path]) => `${path}: 書き込み関数を呼んでいるのに対応表に無い`);
  const entryErrors = ledger.flatMap((entry) => getEntryErrors(entry, sources, specs));
  return [...unlistedErrors, ...entryErrors];
};
