import { describe, expect, it } from "vitest";
import { appendJournal, appendPost, extractPosts, formatPost } from "./journal";

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

describe("formatPost", () => {
  it("改行と連続する空白を 1 つの空白にまとめる", () => {
    expect(formatPost("08:05", "  雨が\n降ってきた   傘なし ")).toBe("- 08:05 雨が 降ってきた 傘なし");
  });
});

describe("appendPost", () => {
  it("無ければ frontmatter つきで新規作成する", () => {
    expect(appendPost(undefined, "2026-10-30", "08:05", "起きた")).toBe(
      "---\ndate: 2026-10-30\n---\n\n- 08:05 起きた\n",
    );
  });

  it("直前の行が投稿なら空行を挟まずに続ける", () => {
    const existing = "---\ndate: 2026-10-30\n---\n\n- 08:05 起きた\n";
    expect(appendPost(existing, "2026-10-30", "12:30", "昼ごはん")).toBe(
      "---\ndate: 2026-10-30\n---\n\n- 08:05 起きた\n- 12:30 昼ごはん\n",
    );
  });

  it("直前が段落なら空行を挟み、既存の行は変えない", () => {
    const existing = "---\ndate: 2026-10-30\n---\n\n朝の分。\n  末尾の空白  \n";
    const result = appendPost(existing, "2026-10-30", "23:10", "寝る");
    expect(result).toBe("---\ndate: 2026-10-30\n---\n\n朝の分。\n  末尾の空白\n\n- 23:10 寝る\n");
  });
});

describe("extractPosts", () => {
  it("投稿の行だけを書いた順に取り出す", () => {
    const content =
      "---\ndate: 2026-10-30\n---\n\n- 08:05 起きた\n- 12:30 昼ごはん\n\n夜の段落。\n- 箇条書き\n\n- 23:10 寝る\n";
    expect(extractPosts(content)).toEqual([
      { time: "08:05", text: "起きた" },
      { time: "12:30", text: "昼ごはん" },
      { time: "23:10", text: "寝る" },
    ]);
  });

  it("投稿が無ければ空配列", () => {
    expect(extractPosts("---\ndate: 2026-10-30\n---\n\n夜の段落。\n")).toEqual([]);
  });
});
