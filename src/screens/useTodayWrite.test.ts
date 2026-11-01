import { describe, expect, it } from "vitest";
import type { WriteState } from "./useTodayWrite";
import {
  canSaveActual,
  clearOfflineFailure,
  getDraftsOfDate,
  getStartedWrite,
  removeSavedDraft,
} from "./useTodayWrite";

const wake = { kind: "wake" } as const;
const turn = { kind: "turn", line: 12, nextChecked: true } as const;

describe("getDraftsOfDate", () => {
  it("4:00 をまたいで日付が変わったら、前日の実績の入力を捨てる", () => {
    const stored = { date: "2026-10-31", drafts: new Map([["09:00\u0000散歩", "歩いた"]]) };

    const current = getDraftsOfDate(stored, "2026-11-01");

    expect(current.date).toBe("2026-11-01");
    expect(current.drafts.size).toBe(0);
  });

  it("同じ日付なら入力をそのまま返す", () => {
    const stored = { date: "2026-11-01", drafts: new Map([["09:00\u0000散歩", "歩いた"]]) };

    expect(getDraftsOfDate(stored, "2026-11-01")).toBe(stored);
  });
});

describe("removeSavedDraft", () => {
  it("保存した値のままなら入力を消す", () => {
    const drafts = new Map([
      ["a", "保存した"],
      ["b", "別の枠"],
    ]);

    expect([...removeSavedDraft(drafts, "a", "保存した")]).toEqual([["b", "別の枠"]]);
  });

  it("保存中に書き換えた入力は残す", () => {
    const drafts = new Map([["a", "書き足した"]]);

    expect(removeSavedDraft(drafts, "a", "保存した")).toBe(drafts);
  });
});

describe("canSaveActual", () => {
  it.each([
    { draft: undefined, actual: "済み", expected: false, note: "入力が無い" },
    { draft: " 済み ", actual: "済み", expected: false, note: "実績と同じ" },
    { draft: "", actual: undefined, expected: false, note: "実績が無く、入力も空" },
    { draft: "歩いた", actual: undefined, expected: true, note: "実績が無く、入力がある" },
    { draft: "歩いた", actual: "済み", expected: true, note: "実績と違う" },
  ])("$note なら $expected", ({ draft, actual, expected }) => {
    expect(canSaveActual(draft, actual)).toBe(expected);
  });
});

describe("getStartedWrite", () => {
  it("書き込み中なら状態を変えない (押し直しで二重に送らない)", () => {
    const writing: WriteState = { status: "writing", target: turn };

    expect(getStartedWrite(writing, true, wake)).toBe(writing);
  });

  it("オンラインなら書き込み中にする", () => {
    expect(getStartedWrite({ status: "idle" }, true, wake)).toEqual({ status: "writing", target: wake });
  });

  it("オフラインなら送らずに、その対象の失敗にする", () => {
    const started = getStartedWrite({ status: "idle" }, false, turn);

    expect(started.status).toBe("error");
    expect(started.status === "error" && started.target).toEqual(turn);
  });

  it("失敗の後は書き直せる", () => {
    const failed: WriteState = {
      status: "error",
      target: wake,
      failure: { reason: "r", hint: "h", action: "retry" },
    };

    expect(getStartedWrite(failed, true, wake)).toEqual({ status: "writing", target: wake });
  });
});

describe("clearOfflineFailure", () => {
  it("オフラインの失敗は消す", () => {
    const offline = getStartedWrite({ status: "idle" }, false, wake);

    expect(clearOfflineFailure(offline)).toEqual({ status: "idle" });
  });

  it("ほかの失敗は残す", () => {
    const failed: WriteState = {
      status: "error",
      target: wake,
      failure: { reason: "r", hint: "h", action: "retry" },
    };

    expect(clearOfflineFailure(failed)).toBe(failed);
  });
});
