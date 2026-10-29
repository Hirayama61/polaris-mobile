import { describe, expect, it } from "vitest";
import { nightDraftKeys, postDraftKey, remainingAfterSave } from "./drafts";

describe("nightDraftKeys", () => {
  it("日付ごとに別の鍵になる(4:00 をまたいでも前日の書きかけが当日に混ざらない)", () => {
    const before = nightDraftKeys("2026-10-29");
    const after = nightDraftKeys("2026-10-30");
    expect(before.review).not.toBe(after.review);
    expect(before.journal).not.toBe(after.journal);
    expect(before.review).not.toBe(before.journal);
  });
});

describe("postDraftKey", () => {
  it("日付ごとに別の鍵になり、夜の画面の鍵とも重ならない", () => {
    expect(postDraftKey("2026-10-29")).not.toBe(postDraftKey("2026-10-30"));
    expect(Object.values(nightDraftKeys("2026-10-29"))).not.toContain(postDraftKey("2026-10-29"));
  });
});

describe("remainingAfterSave", () => {
  it("保存した内容のままなら消してよい", () => {
    expect(remainingAfterSave("今日は眠い", "今日は眠い")).toBeUndefined();
  });

  it("保存中に書き足した分は残す", () => {
    expect(remainingAfterSave("今日は眠い。追記", "今日は眠い")).toBe("今日は眠い。追記");
  });
});
