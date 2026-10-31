import { describe, expect, it } from "vitest";
import {
  getClosedSince,
  getDevRepos,
  getEntryLabel,
  getPrIssueNumber,
  getRepoFailureHint,
  getSlotHours,
  isClosedToday,
  planDevIssues,
} from "./devPlan";
import { parseProject } from "./projects";

const project = (slug: string, frontmatter: string) => parseProject(slug, `---\n${frontmatter}\n---\n本文`);

describe("getDevRepos", () => {
  it("kind: code、status: active、github のあるものだけを、重ならずに返す", () => {
    const projects = [
      project("a", "kind: code\nstatus: active\ngithub: o/a"),
      project("b", "kind: code\nstatus: retired\ngithub: o/b"),
      project("c", "kind: life\nstatus: active\ngithub: o/c"),
      project("d", "kind: code\nstatus: active"),
      project("e", "kind: code\ngithub: o/e"),
      project("f", "kind: code\nstatus: active\ngithub: o/a"),
    ];
    expect(getDevRepos(projects)).toEqual(["o/a"]);
  });
});

// 東京の壁時計で時刻を作る。
const tokyo = (iso: string) => new Date(`${iso}+09:00`);

describe("getSlotHours", () => {
  it("7 時前なら 7 時から 24 時まで", () => {
    expect(getSlotHours(tokyo("2026-10-31T06:30:00"))).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    ]);
  });

  it("日中なら次の時から", () => {
    expect(getSlotHours(tokyo("2026-10-31T21:00:00"))).toEqual([22, 23, 24]);
    expect(getSlotHours(tokyo("2026-10-31T23:59:00"))).toEqual([24]);
  });

  it("0〜4 時は枠が無い", () => {
    expect(getSlotHours(tokyo("2026-11-01T00:10:00"))).toEqual([]);
    expect(getSlotHours(tokyo("2026-11-01T03:59:00"))).toEqual([]);
  });

  it("4 時を過ぎたら 7 時から", () => {
    expect(getSlotHours(tokyo("2026-11-01T04:00:00"))[0]).toBe(7);
  });
});

describe("getPrIssueNumber", () => {
  it("claude/issue-<番号> の番号だけを取る", () => {
    expect(getPrIssueNumber("claude/issue-12")).toBe(12);
    expect(getPrIssueNumber("claude/issue-12-x")).toBeUndefined();
    expect(getPrIssueNumber("feature/issue-12")).toBeUndefined();
  });
});

describe("planDevIssues", () => {
  const issue = (number: number) => ({ number, title: `t${number}`, closedAt: undefined });

  it("番号順に並べ、PR のあるものは枠に入れず、残りを枠に 1 件ずつ入れる", () => {
    const entries = planDevIssues(
      [issue(5), issue(3), issue(4), issue(9)],
      ["claude/issue-4", "main"],
      [10, 11],
    );
    expect(entries).toEqual([
      { kind: "slot", hour: 10, issue: issue(3) },
      { kind: "pr", issue: issue(4) },
      { kind: "slot", hour: 11, issue: issue(5) },
      { kind: "later", issue: issue(9) },
    ]);
  });

  it("枠が無ければ PR の無いものは全部「明日以降」", () => {
    expect(planDevIssues([issue(1)], [], [])).toEqual([{ kind: "later", issue: issue(1) }]);
  });
});

describe("isClosedToday", () => {
  const closedAt = (value: string | undefined) => ({ number: 1, title: "t", closedAt: value });
  const now = tokyo("2026-10-31T22:00:00");

  it("4 時を境界にした今日に閉じたものだけ", () => {
    expect(isClosedToday(closedAt("2026-10-30T19:00:00Z"), now)).toBe(true);
    expect(isClosedToday(closedAt("2026-10-30T18:59:00Z"), now)).toBe(false);
  });

  it("夜中の 1 時でも前日の 4 時以降に閉じたものを今日とする", () => {
    expect(isClosedToday(closedAt("2026-10-31T10:00:00Z"), tokyo("2026-11-01T01:00:00"))).toBe(true);
  });

  it("閉じた日時が無いか読めなければ false", () => {
    expect(isClosedToday(closedAt(undefined), now)).toBe(false);
    expect(isClosedToday(closedAt("not a date"), now)).toBe(false);
  });
});

describe("getClosedSince", () => {
  it("25 時間前の UTC", () => {
    expect(getClosedSince(new Date("2026-10-31T13:00:00Z"))).toBe("2026-10-30T12:00:00.000Z");
  });
});

describe("getEntryLabel", () => {
  const issue = { number: 1, title: "t", closedAt: undefined };

  it("枠は時刻、PR あり、明日以降", () => {
    expect(getEntryLabel({ kind: "slot", hour: 9, issue })).toBe("9 時ごろ");
    expect(getEntryLabel({ kind: "pr", issue })).toBe("PR あり");
    expect(getEntryLabel({ kind: "later", issue })).toBe("明日以降");
  });
});

describe("getRepoFailureHint", () => {
  it("設定の見直しが要るときはトークンの対象に足す案内", () => {
    const failure = { reason: "r", hint: "h", action: "settings" } as const;
    expect(getRepoFailureHint(failure, "o/a")).toContain("o/a");
  });

  it("やり直しのときは元の案内", () => {
    const failure = { reason: "r", hint: "h", action: "retry" } as const;
    expect(getRepoFailureHint(failure, "o/a")).toBe("h");
  });
});
