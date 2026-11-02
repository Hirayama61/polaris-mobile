import { describe, expect, it } from "vitest";
import {
  getClosedAt,
  getLabelNames,
  hasHeadRef,
  hasMergedAt,
  isIssueEntry,
  toRepoIssues,
  toRepoOpenIssue,
} from "./repoEntries";

describe("isIssueEntry", () => {
  it("番号と題名を持つ Issue を通す", () => {
    expect(isIssueEntry({ number: 1, title: "直す" })).toBe(true);
  });

  it("pull_request を持つ要素は PR なので除く", () => {
    expect(isIssueEntry({ number: 2, title: "PR", pull_request: {} })).toBe(false);
  });

  it("番号か題名が欠けた要素は除く", () => {
    expect(isIssueEntry({ title: "番号なし" })).toBe(false);
    expect(isIssueEntry({ number: 3 })).toBe(false);
    expect(isIssueEntry(null)).toBe(false);
  });
});

describe("toRepoIssues", () => {
  it("PR を除いて Issue だけを変換する", () => {
    const body = [
      { number: 1, title: "Issue", closed_at: "2026-11-01T00:00:00Z" },
      { number: 2, title: "PR", pull_request: { url: "x" } },
    ];
    expect(toRepoIssues(body)).toEqual([{ number: 1, title: "Issue", closedAt: "2026-11-01T00:00:00Z" }]);
  });

  it("本文が配列でなければ空にする", () => {
    expect(toRepoIssues({ message: "Not Found" })).toEqual([]);
  });
});

describe("getClosedAt", () => {
  it("closed_at が文字列ならその値を返す", () => {
    expect(getClosedAt({ number: 1, title: "t", closed_at: "2026-11-01T00:00:00Z" })).toBe(
      "2026-11-01T00:00:00Z",
    );
  });

  it("closed_at が文字列でなければ undefined を返す", () => {
    expect(getClosedAt({ number: 1, title: "t", closed_at: null })).toBeUndefined();
    expect(getClosedAt({ number: 1, title: "t", closed_at: 0 })).toBeUndefined();
    expect(getClosedAt({ number: 1, title: "t" })).toBeUndefined();
  });
});

describe("getLabelNames", () => {
  it("名前が文字列のラベルだけを返す", () => {
    const labels = [{ name: "ready" }, { name: 1 }, "bug", null, { name: "hold" }];
    expect(getLabelNames({ number: 1, title: "t", labels })).toEqual(["ready", "hold"]);
  });

  it("labels が配列でなければ空にする", () => {
    expect(getLabelNames({ number: 1, title: "t", labels: "ready" })).toEqual([]);
    expect(getLabelNames({ number: 1, title: "t" })).toEqual([]);
  });
});

describe("toRepoOpenIssue", () => {
  it("番号、題名、ラベル名にする", () => {
    const entry = { number: 4, title: "t", labels: [{ name: "ready" }] };
    expect(toRepoOpenIssue(entry)).toEqual({ number: 4, title: "t", labels: ["ready"] });
  });
});

describe("hasHeadRef", () => {
  it("head.ref が文字列の PR を通す", () => {
    expect(hasHeadRef({ head: { ref: "claude/issue-1" } })).toBe(true);
  });

  it("head か head.ref が欠けた要素は除く", () => {
    expect(hasHeadRef({})).toBe(false);
    expect(hasHeadRef({ head: null })).toBe(false);
    expect(hasHeadRef({ head: { ref: 1 } })).toBe(false);
  });
});

describe("hasMergedAt", () => {
  it("merged_at が文字列の PR を通す", () => {
    expect(hasMergedAt({ merged_at: "2026-11-01T00:00:00Z" })).toBe(true);
  });

  it("merged_at が無いか null の PR はマージされていないので除く", () => {
    expect(hasMergedAt({ merged_at: null })).toBe(false);
    expect(hasMergedAt({})).toBe(false);
    expect(hasMergedAt(undefined)).toBe(false);
  });
});
