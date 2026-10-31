import { describe, expect, it } from "vitest";
import { checkLedger, getTestNames, isWriteCaller, type LedgerEntry, parseLedger } from "./ledger";

const spec = `import { test } from "@playwright/test";

test("チェックを付けると PUT される", async ({ page }) => {});
test(
  "コマを消すと、その行だけがなくなる",
  async ({ page }) => {},
);
test("引用符 \\"a\\" を含む", async () => {});
`;
const specs = new Map([["e2e/today.spec.ts", spec]]);
const caller = `import { updateFile } from "./github";\nupdateFile(settings, path, message, transform);\n`;
const reader = `import { readFile } from "./github";\nreadFile(settings, path);\n`;
const covered: LedgerEntry = {
  file: "src/Today.tsx",
  operation: "チェックを付ける",
  e2e: [{ spec: "e2e/today.spec.ts", test: "チェックを付けると PUT される" }],
};
const pending: LedgerEntry = { file: "src/Feedback.tsx", operation: "要望を送る", e2e: [], pending: true };

describe("isWriteCaller", () => {
  it.each(["updateFile(", "writeKnownFile(", "writeIfUnchanged(", "createFile("])(
    "%s の呼び出しを見つける",
    (call) => {
      expect(isWriteCaller(`x = ${call}a);`)).toBe(true);
    },
  );

  it("読み取りと import だけなら呼んでいない", () => {
    expect(isWriteCaller(reader)).toBe(false);
    expect(isWriteCaller(`import { createFile } from "./github";\n`)).toBe(false);
  });
});

describe("getTestNames", () => {
  it("1 行目と改行の後のテスト名、エスケープした引用符を読む", () => {
    expect(getTestNames(spec)).toEqual([
      "チェックを付けると PUT される",
      "コマを消すと、その行だけがなくなる",
      '引用符 "a" を含む',
    ]);
  });
});

describe("parseLedger", () => {
  it("形が合えばそのまま返す", () => {
    expect(parseLedger([covered, pending])).toEqual([covered, pending]);
  });

  it.each([
    ["配列でない", { file: "src/a.ts" }],
    ["e2e が無い", [{ file: "src/a.ts", operation: "書く" }]],
    ["テスト名が無い", [{ file: "src/a.ts", operation: "書く", e2e: [{ spec: "e2e/a.spec.ts" }] }]],
    ["pending が true でない", [{ file: "src/a.ts", operation: "書く", e2e: [], pending: false }]],
  ])("%s なら例外を投げる", (_, json) => {
    expect(() => parseLedger(json)).toThrow("e2e/ledger.json");
  });
});

describe("checkLedger", () => {
  const sources = new Map([
    ["src/Today.tsx", caller],
    ["src/Feedback.tsx", caller],
    ["src/Reader.tsx", reader],
  ]);

  it("すべて合っていれば空", () => {
    expect(checkLedger([covered, pending], sources, specs)).toEqual([]);
  });

  it("書き込み関数を呼ぶファイルが対応表に無ければ落とす", () => {
    expect(checkLedger([covered], sources, specs)).toEqual([
      "src/Feedback.tsx: 書き込み関数を呼んでいるのに対応表に無い",
    ]);
  });

  it("対応表のファイルが無ければ落とす", () => {
    const missing = { ...pending, file: "src/Gone.tsx" };
    expect(checkLedger([covered, pending, missing], sources, specs)).toEqual([
      "src/Gone.tsx (要望を送る): ファイルが無い",
    ]);
  });

  it("対応表のファイルが書き込み関数を呼んでいなければ落とす", () => {
    const notCaller = { ...pending, file: "src/Reader.tsx" };
    expect(checkLedger([covered, pending, notCaller], sources, specs)).toEqual([
      "src/Reader.tsx (要望を送る): 書き込み関数を呼んでいない",
    ]);
  });

  it("テスト名が spec に無ければ落とす", () => {
    const renamed = { ...covered, e2e: [{ spec: "e2e/today.spec.ts", test: "チェックを付ける" }] };
    expect(checkLedger([renamed, pending], sources, specs)).toEqual([
      "src/Today.tsx (チェックを付ける): e2e/today.spec.ts にテスト「チェックを付ける」が無い",
    ]);
  });

  it("spec が無ければテスト名も無いとして落とす", () => {
    const noSpec = { ...covered, e2e: [{ spec: "e2e/gone.spec.ts", test: "チェックを付けると PUT される" }] };
    expect(checkLedger([noSpec, pending], sources, specs)).toEqual([
      "src/Today.tsx (チェックを付ける): e2e/gone.spec.ts にテスト「チェックを付けると PUT される」が無い",
    ]);
  });

  it("pending でない行に担当の E2E が無ければ落とす", () => {
    const { pending: _, ...notPending } = pending;
    expect(checkLedger([covered, notPending], sources, specs)).toEqual([
      "src/Feedback.tsx (要望を送る): pending でないのに担当の E2E が無い",
    ]);
  });
});
