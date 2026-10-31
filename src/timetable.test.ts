import { describe, expect, it } from "vitest";
import type { ScheduleRow, TurnItem } from "./daily";
import { buildTimetable, isWakeText } from "./timetable";

const row = (line: number, time: string, what: string): ScheduleRow => ({
  line,
  time,
  what,
  who: "あなた",
  actual: "",
});

const turn = (line: number, label: string): TurnItem => ({ line, isChecked: false, label });

describe("isWakeText", () => {
  it("起床で始まれば true", () => {
    expect(isWakeText("起床")).toBe(true);
    expect(isWakeText("起床・白湯")).toBe(true);
    expect(isWakeText("散歩のあと起床")).toBe(false);
  });
});

describe("buildTimetable", () => {
  it("起床のコマがあれば足さない", () => {
    const { slots } = buildTimetable([row(10, "06:30–06:45", "起床"), row(11, "07:00–07:30", "散歩")], []);
    expect(slots.map((slot) => slot.source)).toEqual(["schedule", "schedule"]);
    expect(slots[0]).toMatchObject({ source: "schedule", opens: { kind: "wake" } });
    expect(slots[1]).toMatchObject({ source: "schedule", opens: { kind: "none" } });
  });

  it("起床のコマが無ければ先頭に 1 行だけ足す", () => {
    const { slots } = buildTimetable([row(10, "07:00–07:30", "散歩")], []);
    expect(slots.map((slot) => slot.source)).toEqual(["added-wake", "schedule"]);
  });

  it("時間割が空でも起床の行を出す", () => {
    expect(buildTimetable([], []).slots).toEqual([{ source: "added-wake" }]);
  });

  it("コマと同じ task id の「あなたの番」を結び付け、残りを unscheduled にする", () => {
    const report = turn(20, "請求書を送る: freee で出す (task: 20261029-abcd)");
    const novel = turn(21, "小説の構想を音声で入れる");
    const other = turn(22, "Google アカウントを作る (task: 20261025-oubf)");
    const { slots, unscheduled } = buildTimetable(
      [row(10, "06:30–06:45", "起床"), row(11, "10:00–10:15", "請求書 (task: 20261029-abcd)")],
      [report, novel, other],
    );
    expect(slots[1]).toMatchObject({
      source: "schedule",
      text: "請求書",
      taskId: "20261029-abcd",
      opens: { kind: "task", taskId: "20261029-abcd" },
      turn: report,
    });
    expect(slots[0]).toMatchObject({ source: "schedule", taskId: undefined, turn: undefined });
    expect(unscheduled).toEqual([novel, other]);
  });

  it("起床のコマは task id があっても起床を開く", () => {
    const { slots } = buildTimetable([row(10, "06:30–06:45", "起床 (task: 20261029-abcd)")], []);
    expect(slots[0]).toMatchObject({ opens: { kind: "wake" }, taskId: "20261029-abcd" });
  });

  it("task id の合う「あなたの番」が無いコマは turn を持たない", () => {
    const { slots } = buildTimetable([row(10, "10:00–10:15", "請求書 (task: 20261029-abcd)")], []);
    expect(slots[1]).toMatchObject({ source: "schedule", taskId: "20261029-abcd", turn: undefined });
  });
});
