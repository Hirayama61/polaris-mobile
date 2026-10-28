import { describe, expect, it } from "vitest";
import { isNowInSlot, splitTaskRef } from "./display";

describe("splitTaskRef", () => {
  it("末尾の (task: ID) を切り離す", () => {
    expect(splitTaskRef("Google アカウントを作る (task: 20261025-oubf)")).toEqual({
      text: "Google アカウントを作る",
      taskId: "20261025-oubf",
    });
  });

  it("task が無ければ全体を本文にする", () => {
    expect(splitTaskRef("小説の構想を音声で入れる")).toEqual({
      text: "小説の構想を音声で入れる",
      taskId: undefined,
    });
  });

  it("途中の括弧や本文の無い task は切り離さない", () => {
    expect(splitTaskRef("(task: abc) の続き")).toEqual({ text: "(task: abc) の続き", taskId: undefined });
    expect(splitTaskRef("(task: abc)")).toEqual({ text: "(task: abc)", taskId: undefined });
  });
});

describe("isNowInSlot", () => {
  const at = (hour: number, minute: number): number => hour * 60 + minute;

  it("開始を含み終了を含まない", () => {
    expect(isNowInSlot("07:00–07:30", at(7, 0))).toBe(true);
    expect(isNowInSlot("07:00–07:30", at(7, 29))).toBe(true);
    expect(isNowInSlot("07:00–07:30", at(7, 30))).toBe(false);
    expect(isNowInSlot("07:00–07:30", at(6, 59))).toBe(false);
  });

  it("ハイフンや波線の区切りと 1 桁の時も受け付ける", () => {
    expect(isNowInSlot("9:00-18:00", at(12, 0))).toBe(true);
    expect(isNowInSlot("21:30〜22:00", at(21, 45))).toBe(true);
  });

  it("形が違えば false", () => {
    expect(isNowInSlot("午前", at(9, 0))).toBe(false);
    expect(isNowInSlot("", at(9, 0))).toBe(false);
  });
});
