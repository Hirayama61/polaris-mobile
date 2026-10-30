import { describe, expect, it } from "vitest";
import {
  type BlogPost,
  extractComment,
  getBlogStage,
  getBlogTitle,
  getCommentFolder,
  isPublicUrl,
  loadBlogPosts,
  publishDraft,
  setComment,
  sortBlogPosts,
  toBlogPath,
} from "./blog";

const outline = `---
created: 2026-10-29
---

# 朝の散歩を続けるコツ

## 構成

- 始めたきっかけ
- 続いた理由

## 下調べ

- 散歩と睡眠の関係

## 一言
`;

const draft = `---
status: draft
---

# 朝の散歩を続けるコツ

本文。

## 一言
`;

const post = (overrides: Partial<BlogPost>): BlogPost => ({
  id: "2026-10-29-walk",
  title: "朝の散歩",
  stage: "needsComment",
  files: { outline },
  ...overrides,
});

describe("setComment", () => {
  it("一言節の本文だけを書き、他の行は 1 文字も変えない", () => {
    const after = setComment(outline, "体験談を厚めに。");
    expect(after).toBe(outline.replace("## 一言\n", "## 一言\n\n体験談を厚めに。\n"));
    expect(extractComment(after)).toBe("体験談を厚めに。");
  });

  it("既存の一言を置き換える", () => {
    expect(setComment(setComment(outline, "一度目"), "二度目")).toBe(setComment(outline, "二度目"));
  });

  it("空文字列にすると元に戻る", () => {
    expect(setComment(setComment(outline, "一度目"), "")).toBe(outline);
  });

  it("一言が最後の節でなくても、次の節は変えない", () => {
    const text = "# 題\n\n## 一言\n\n## 参考\n\n- a\n";
    expect(setComment(text, "短く")).toBe("# 題\n\n## 一言\n\n短く\n\n## 参考\n\n- a\n");
  });

  it("節が無ければ末尾に追加する", () => {
    expect(setComment("# 題\n\n本文\n", "短く")).toBe("# 題\n\n本文\n\n## 一言\n\n短く\n");
  });
});

describe("publishDraft", () => {
  it("frontmatter の status と url だけを変える", () => {
    const after = publishDraft(draft, "https://example.com/walk");
    expect(after).toBe(draft.replace("status: draft\n", "status: done\nurl: https://example.com/walk\n"));
  });

  it("url が既にあれば置き換える", () => {
    const once = publishDraft(draft, "https://example.com/a");
    expect(publishDraft(once, "https://example.com/b")).toBe(publishDraft(draft, "https://example.com/b"));
  });

  it("frontmatter が無ければ先頭に作る", () => {
    expect(publishDraft("# 題\n", "https://example.com/a")).toBe(
      "---\nstatus: done\nurl: https://example.com/a\n---\n\n# 題\n",
    );
  });
});

describe("isPublicUrl", () => {
  it.each([
    ["https://example.com/a", true],
    [" http://example.com ", true],
    ["javascript:alert(1)", false],
    ["example.com", false],
    ["", false],
  ])("%s は %s", (value, expected) => {
    expect(isPublicUrl(value)).toBe(expected);
  });
});

describe("getBlogStage", () => {
  it("ideas だけなら構成待ち", () => {
    expect(getBlogStage({ ideas: "---\nstatus: new\n---\n" })).toBe("needsOutline");
  });

  it("outline の一言が空なら一言待ち", () => {
    expect(getBlogStage({ ideas: "", outline })).toBe("needsComment");
  });

  it("outline に一言があれば下書き待ち", () => {
    expect(getBlogStage({ outline: setComment(outline, "よい") })).toBe("needsDraft");
  });

  it("draft があれば下書き", () => {
    expect(getBlogStage({ outline, draft })).toBe("drafting");
  });

  it("draft が status: done なら公開", () => {
    expect(getBlogStage({ draft: publishDraft(draft, "https://example.com") })).toBe("published");
  });

  it("published にあれば公開", () => {
    expect(getBlogStage({ draft, published: "# 題\n" })).toBe("published");
  });
});

describe("getCommentFolder", () => {
  it("draft があれば draft に書く", () => {
    expect(getCommentFolder(post({ stage: "drafting", files: { outline, draft } }))).toBe("draft");
  });

  it("draft が無ければ outline に書く", () => {
    expect(getCommentFolder(post({}))).toBe("outline");
  });

  it("公開済みなら書かない", () => {
    expect(getCommentFolder(post({ stage: "published", files: { draft } }))).toBeUndefined();
  });

  it("ideas だけなら書かない", () => {
    expect(getCommentFolder(post({ stage: "needsOutline", files: { ideas: "" } }))).toBeUndefined();
  });
});

describe("getBlogTitle", () => {
  it("frontmatter の title を使う", () => {
    expect(getBlogTitle("a", { ideas: "---\ntitle: 散歩\n---\n" })).toBe("散歩");
  });

  it("title が無ければ最初の # 見出しを使う", () => {
    expect(getBlogTitle("a", { ideas: "", outline })).toBe("朝の散歩を続けるコツ");
  });

  it("どちらも無ければ id を使う", () => {
    expect(getBlogTitle("2026-10-29-walk", { ideas: "メモ\n" })).toBe("2026-10-29-walk");
  });
});

describe("sortBlogPosts", () => {
  it("人の手が要る段階を先に、同じ段階では id の新しい順に並べる", () => {
    const posts = [
      post({ id: "a", stage: "published" }),
      post({ id: "b", stage: "needsOutline" }),
      post({ id: "c", stage: "needsComment" }),
      post({ id: "d", stage: "needsComment" }),
    ];
    expect(sortBlogPosts(posts).map(({ id }) => id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("loadBlogPosts", () => {
  const files = new Map([
    [toBlogPath("ideas", "walk"), "---\nstatus: new\n---\n\n散歩の話\n"],
    [toBlogPath("outline", "walk"), outline],
    [toBlogPath("ideas", "tea"), "---\ntitle: お茶\n---\n"],
  ]);
  const list = async (path: string): Promise<readonly string[]> =>
    [...files.keys()]
      .filter((key) => key.startsWith(`${path}/`))
      .map((key) => key.slice(path.length + 1))
      .concat(path.endsWith("ideas") ? ["README", "../x.md"] : []);
  const read = async (path: string): Promise<string | undefined> => files.get(path);

  it("同じ id のファイルを 1 本にまとめ、段階を付ける", async () => {
    const posts = await loadBlogPosts(list, read);
    expect(posts.map(({ id, title, stage }) => ({ id, title, stage }))).toEqual([
      { id: "walk", title: "朝の散歩を続けるコツ", stage: "needsComment" },
      { id: "tea", title: "お茶", stage: "needsOutline" },
    ]);
    expect(Object.keys(posts[0]?.files ?? {})).toEqual(["ideas", "outline"]);
  });

  it("一覧の後に消えたファイルしか無い記事は出さない", async () => {
    const posts = await loadBlogPosts(list, async (path) =>
      path.includes("tea") ? undefined : files.get(path),
    );
    expect(posts.map(({ id }) => id)).toEqual(["walk"]);
  });
});
