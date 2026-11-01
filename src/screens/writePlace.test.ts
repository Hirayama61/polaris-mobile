import { describe, expect, it } from "vitest";
import { isWriteAt, type WritePlace, type WriteTarget } from "./writePlace";

describe("isWriteAt", () => {
  it.each<[string, WriteTarget, WritePlace, boolean]>([
    ["同じ行のチェック", { kind: "turn", line: 12, nextChecked: true }, { kind: "turn", line: 12 }, true],
    [
      "チェックを外す向きでも同じ行",
      { kind: "turn", line: 12, nextChecked: false },
      { kind: "turn", line: 12 },
      true,
    ],
    ["別の行のチェック", { kind: "turn", line: 12, nextChecked: true }, { kind: "turn", line: 13 }, false],
    [
      "同じ時間枠の実績",
      { kind: "actual", slot: "07:00–07:30\u0000散歩" },
      { kind: "actual", slot: "07:00–07:30\u0000散歩" },
      true,
    ],
    [
      "別の時間枠の実績",
      { kind: "actual", slot: "07:00–07:30\u0000散歩" },
      { kind: "actual", slot: "09:00–18:00\u0000仕事" },
      false,
    ],
    ["起床", { kind: "wake" }, { kind: "wake" }, true],
    ["起床と実績", { kind: "wake" }, { kind: "actual", slot: "07:00–07:30\u0000散歩" }, false],
    ["チェックと起床", { kind: "turn", line: 12, nextChecked: true }, { kind: "wake" }, false],
  ])("%s", (_, target, place, expected) => {
    expect(isWriteAt(target, place)).toBe(expected);
  });
});
