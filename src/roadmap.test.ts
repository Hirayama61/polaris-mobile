import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "./projects";
import {
  countMergedByDay,
  formatShortDate,
  getBarHeight,
  getClosedWithin,
  getRecentDays,
  getRoadmapRepo,
  getRoadmapSince,
  isClosedWithin,
  sortOpenIssues,
} from "./roadmap";

// 東京の 2026-10-31 22:00。
const now = new Date("2026-10-31T22:00:00+09:00");

const project = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  slug: "polaris",
  name: "Polaris",
  isRetired: false,
  status: "active",
  kind: "code",
  github: "o/a",
  body: "",
  ...overrides,
});

describe("getRecentDays", () => {
  it("今日までの 14 日を古い順に並べ、月をまたぐ", () => {
    const days = getRecentDays(now);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-18");
    expect(days[13]).toBe("2026-10-31");
  });

  it("0〜4 時は前日を今日として数える", () => {
    const days = getRecentDays(new Date("2026-11-01T03:00:00+09:00"));
    expect(days[13]).toBe("2026-10-31");
  });
});

describe("getRoadmapSince", () => {
  it("最初の日の 4 時 (東京) を UTC で返す", () => {
    expect(getRoadmapSince(now)).toBe("2026-10-17T19:00:00.000Z");
  });
});

describe("getRoadmapRepo", () => {
  it("連携プロジェクトなら github を返す", () => {
    expect(getRoadmapRepo(project({}))).toBe("o/a");
  });

  it("選んでいないか、code・active・github のどれかが欠けたら undefined", () => {
    expect(getRoadmapRepo(undefined)).toBeUndefined();
    expect(getRoadmapRepo(project({ kind: "novel" }))).toBeUndefined();
    expect(getRoadmapRepo(project({ status: "paused" }))).toBeUndefined();
    expect(getRoadmapRepo(project({ github: undefined }))).toBeUndefined();
  });
});

describe("isClosedWithin", () => {
  const days = getRecentDays(now);

  it("期間の最初の日の 4 時以降に閉じたものは入る", () => {
    expect(isClosedWithin({ number: 1, title: "a", closedAt: "2026-10-18T04:00:00+09:00" }, days)).toBe(true);
  });

  it("その前に閉じたものと、閉じた日時の無いものは入らない", () => {
    expect(isClosedWithin({ number: 1, title: "a", closedAt: "2026-10-18T03:59:00+09:00" }, days)).toBe(
      false,
    );
    expect(isClosedWithin({ number: 1, title: "a", closedAt: undefined }, days)).toBe(false);
  });
});

describe("getClosedWithin", () => {
  it("期間内に閉じたものを新しく閉じた順に並べる", () => {
    const issues = [
      { number: 1, title: "古い", closedAt: "2026-10-20T10:00:00+09:00" },
      { number: 2, title: "期間外", closedAt: "2026-10-01T10:00:00+09:00" },
      { number: 3, title: "新しい", closedAt: "2026-10-31T10:00:00+09:00" },
    ];
    expect(getClosedWithin(issues, getRecentDays(now)).map((issue) => issue.number)).toEqual([3, 1]);
  });
});

describe("sortOpenIssues", () => {
  it("番号順に並べる", () => {
    const issues = [
      { number: 12, title: "b", labels: [] },
      { number: 3, title: "a", labels: ["ready"] },
    ];
    expect(sortOpenIssues(issues).map((issue) => issue.number)).toEqual([3, 12]);
  });
});

describe("countMergedByDay", () => {
  it("日ごとに数え、4 時より前は前日に数え、期間外は数えない", () => {
    const days = ["2026-10-30", "2026-10-31"];
    const counts = countMergedByDay(
      [
        "2026-10-31T10:00:00+09:00",
        "2026-10-31T23:00:00+09:00",
        "2026-10-31T03:00:00+09:00",
        "2026-10-01T10:00:00Z",
      ],
      days,
    );
    expect(counts).toEqual([
      { date: "2026-10-30", count: 1 },
      { date: "2026-10-31", count: 2 },
    ]);
  });
});

describe("getBarHeight", () => {
  it("いちばん多い日を最大の高さにそろえる", () => {
    expect(getBarHeight(2, 4, 56)).toBe(28);
    expect(getBarHeight(4, 4, 56)).toBe(56);
  });

  it("期間に 1 件も無ければ 0", () => {
    expect(getBarHeight(0, 0, 56)).toBe(0);
  });
});

describe("formatShortDate", () => {
  it("月と日を先頭の 0 を外して並べる", () => {
    expect(formatShortDate("2026-10-08")).toBe("10/8");
  });
});
