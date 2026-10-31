import { describe, expect, it } from "vitest";
import { getIssueLink, linkifyText } from "./linkify";

describe("linkifyText", () => {
  it("https の URL をリンクにし、後ろの句読点は文字に残す", () => {
    expect(linkifyText("詳しくは https://example.com/a?b=1 を見る。https://example.com/c.")).toEqual([
      { kind: "text", text: "詳しくは " },
      { kind: "link", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { kind: "text", text: " を見る。" },
      { kind: "link", text: "https://example.com/c", href: "https://example.com/c" },
      { kind: "text", text: "." },
    ]);
  });

  it("全角の句読点の手前で URL を切る", () => {
    expect(linkifyText("https://example.com/x、次へ")).toEqual([
      { kind: "link", text: "https://example.com/x", href: "https://example.com/x" },
      { kind: "text", text: "、次へ" },
    ]);
  });

  it("owner/name#N を GitHub の Issue へのリンクにする", () => {
    expect(linkifyText("対象は Hirayama61/shogi-atlas-app#68 です")).toEqual([
      { kind: "text", text: "対象は " },
      {
        kind: "link",
        text: "Hirayama61/shogi-atlas-app#68",
        href: "https://github.com/Hirayama61/shogi-atlas-app/issues/68",
      },
      { kind: "text", text: " です" },
    ]);
  });

  it("URL の中の owner/name#N は URL の一部のまま", () => {
    expect(linkifyText("https://github.com/o/r#1")).toEqual([
      { kind: "link", text: "https://github.com/o/r#1", href: "https://github.com/o/r#1" },
    ]);
  });

  it("リンクでない文、http、javascript:、#N だけ、パスの途中は文字のまま", () => {
    const text = "画面を 3 つに保つ\nhttp://example.com javascript:alert(1) #12 a/b/c#3";
    expect(linkifyText(text)).toEqual([{ kind: "text", text }]);
  });
});

describe("getIssueLink", () => {
  it("owner/name#N と github.com の URL を読む", () => {
    const expected = { kind: "link", text: "o/r#5", href: "https://github.com/o/r/issues/5" };
    expect(getIssueLink("o/r#5")).toEqual(expected);
    expect(getIssueLink("https://github.com/o/r/issues/5")).toEqual(expected);
    expect(getIssueLink("https://github.com/o/r/pull/5")).toEqual(expected);
  });

  it("値が無い、番号だけ、github.com 以外は undefined", () => {
    expect(getIssueLink(undefined)).toBeUndefined();
    expect(getIssueLink("5")).toBeUndefined();
    expect(getIssueLink("https://example.com/o/r/issues/5")).toBeUndefined();
  });
});
