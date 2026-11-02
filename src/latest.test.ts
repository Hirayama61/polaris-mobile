import { describe, expect, it } from "vitest";
import { beginLatest, cancelLatest } from "./latest";

describe("beginLatest", () => {
  it("始めたばかりの読み込みは最新", () => {
    const isCurrent = beginLatest({ current: 0 });
    expect(isCurrent()).toBe(true);
  });

  it("後から読み込みを始めると、前の読み込みは最新でなくなる", () => {
    const latest = { current: 0 };
    const first = beginLatest(latest);
    const second = beginLatest(latest);
    expect([first(), second()]).toEqual([false, true]);
  });
});

describe("cancelLatest", () => {
  it("取り消すと、始めていた読み込みは最新でなくなる", () => {
    const latest = { current: 0 };
    const isCurrent = beginLatest(latest);
    cancelLatest(latest);
    expect(isCurrent()).toBe(false);
  });
});
