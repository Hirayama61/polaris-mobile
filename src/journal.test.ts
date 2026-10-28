import { describe, expect, it } from "vitest";
import { appendJournal } from "./journal";

describe("appendJournal", () => {
  it("無ければ frontmatter つきで新規作成する", () => {
    expect(appendJournal(undefined, "2026-10-30", "今日は雨。\n")).toBe(
      "---\ndate: 2026-10-30\n---\n\n今日は雨。\n",
    );
  });

  it("あれば末尾に空行を挟んで追記する", () => {
    const existing = "---\ndate: 2026-10-30\n---\n\n朝の分。\n";
    expect(appendJournal(existing, "2026-10-30", "夜の分。")).toBe(
      "---\ndate: 2026-10-30\n---\n\n朝の分。\n\n夜の分。\n",
    );
  });
});
