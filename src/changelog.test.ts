import { describe, expect, it } from "vitest";
import { formatAppVersion, parseChangelog } from "./changelog";

const line = (...fields: string[]): string => fields.join("\x1f");

describe("parseChangelog", () => {
  it("git log の行を順番どおりに読む", () => {
    const raw = [
      line("37fa77e", "2026-10-29", "feat: タスクに疑問点を書く (#32)"),
      line("07d22da", "2026-10-28", "feat: チェックリストを展開する (#27)"),
      "",
    ].join("\n");
    expect(parseChangelog(raw)).toEqual([
      { hash: "37fa77e", date: "2026-10-29", subject: "feat: タスクに疑問点を書く (#32)" },
      { hash: "07d22da", date: "2026-10-28", subject: "feat: チェックリストを展開する (#27)" },
    ]);
  });

  it("空や形の崩れた行は捨てる", () => {
    const raw = [
      "",
      "fatal: not a git repository",
      line("zzzzzzz", "2026-10-29", "a"),
      line("37fa77e", "10/29", "a"),
      line("37fa77e", "2026-10-29", "  "),
      line("abc1234", "2026-10-29", "残る"),
    ].join("\r\n");
    expect(parseChangelog(raw)).toEqual([{ hash: "abc1234", date: "2026-10-29", subject: "残る" }]);
    expect(parseChangelog("")).toEqual([]);
  });
});

describe("formatAppVersion", () => {
  it("履歴があれば先頭の識別子を添える", () => {
    expect(
      formatAppVersion("0.1.0", [
        { hash: "37fa77e", date: "2026-10-29", subject: "a" },
        { hash: "07d22da", date: "2026-10-28", subject: "b" },
      ]),
    ).toBe("v0.1.0 · 37fa77e");
  });

  it("履歴が空なら package の版だけ", () => {
    expect(formatAppVersion("0.1.0", [])).toBe("v0.1.0");
  });
});
