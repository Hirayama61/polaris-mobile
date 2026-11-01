import { describe, expect, it } from "vitest";
import { hasSlotEnded, isDoneActual, isNowInSlot, splitTaskRef, splitTurnLabel } from "./display";

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

describe("hasSlotEnded", () => {
  const at = (hour: number, minute: number): number => hour * 60 + minute;

  it("終了時刻ちょうどから終わったとみなす", () => {
    expect(hasSlotEnded("07:00–07:30", at(7, 29))).toBe(false);
    expect(hasSlotEnded("07:00–07:30", at(7, 30))).toBe(true);
    expect(hasSlotEnded("07:00–07:30", at(12, 0))).toBe(true);
  });

  it("始まる前と途中は終わっていない", () => {
    expect(hasSlotEnded("09:00-18:00", at(8, 0))).toBe(false);
    expect(hasSlotEnded("09:00-18:00", at(12, 0))).toBe(false);
  });

  it("形が違えば false", () => {
    expect(hasSlotEnded("午前", at(23, 0))).toBe(false);
    expect(hasSlotEnded("", at(23, 0))).toBe(false);
  });
});

describe("isDoneActual", () => {
  it("前後の空白を除いて「完了」なら true", () => {
    expect(isDoneActual("完了")).toBe(true);
    expect(isDoneActual(" 完了 ")).toBe(true);
  });

  it("空、書き足し、列が無いときは false", () => {
    expect(isDoneActual("")).toBe(false);
    expect(isDoneActual("完了 20分")).toBe(false);
    expect(isDoneActual("未完了")).toBe(false);
    expect(isDoneActual(undefined)).toBe(false);
  });
});

describe("splitTurnLabel", () => {
  it("タイトル・手順・目安時間・task を分ける", () => {
    expect(
      splitTurnLabel("請求書を送る: freee で PDF を出してメールに添付 (15 分) (task: 20261029-abcd)"),
    ).toEqual({
      title: "請求書を送る",
      steps: "freee で PDF を出してメールに添付 (15 分)",
      minutes: "15 分",
      taskId: "20261029-abcd",
    });
  });

  it("目安時間と task は無くてもよい", () => {
    expect(splitTurnLabel("散歩: 近所を 1 周")).toEqual({
      title: "散歩",
      steps: "近所を 1 周",
      minutes: undefined,
      taskId: undefined,
    });
    expect(splitTurnLabel("散歩: 近所を 1 周（20分）")).toMatchObject({ minutes: "20 分" });
  });

  it("2 つ目以降の `: ` は手順に含める", () => {
    expect(splitTurnLabel("設定: 手順 1: 開く")).toMatchObject({ title: "設定", steps: "手順 1: 開く" });
  });

  it("`: ` が無いか前後が空なら全文をタイトルにして展開しない", () => {
    const none = { steps: undefined, minutes: undefined };
    expect(splitTurnLabel("小説の構想を音声で入れる (10 分) (task: x)")).toEqual({
      title: "小説の構想を音声で入れる (10 分)",
      taskId: "x",
      ...none,
    });
    expect(splitTurnLabel("時刻 9:00 に電話")).toEqual({
      title: "時刻 9:00 に電話",
      taskId: undefined,
      ...none,
    });
    expect(splitTurnLabel(": 手順だけ")).toEqual({ title: ": 手順だけ", taskId: undefined, ...none });
    expect(splitTurnLabel("タイトルだけ: ")).toEqual({ title: "タイトルだけ: ", taskId: undefined, ...none });
  });
});
