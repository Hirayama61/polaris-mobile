import { describe, expect, it } from "vitest";
import { getFileNamesIn, toRepoTree } from "./tree";

describe("toRepoTree", () => {
  it("blob だけをパスから sha への対応にする", () => {
    const tree = toRepoTree({
      truncated: false,
      tree: [
        { type: "tree", path: "tasks", sha: "t0" },
        { type: "blob", path: "tasks/a.md", sha: "b1" },
        { type: "blob", path: "daily/2026-11-01.md", sha: "b2" },
      ],
    });
    expect(tree).toEqual({
      kind: "complete",
      shas: new Map([
        ["tasks/a.md", "b1"],
        ["daily/2026-11-01.md", "b2"],
      ]),
    });
  });

  it("切り詰められた応答は truncated にする (一部のファイルだけで一覧を作らない)", () => {
    expect(toRepoTree({ truncated: true, tree: [{ type: "blob", path: "a.md", sha: "b1" }] })).toEqual({
      kind: "truncated",
    });
  });

  it("形の違う要素は飛ばす", () => {
    const tree = toRepoTree({
      tree: [{ type: "blob", path: "a.md" }, null, { type: "blob", path: "b.md", sha: "b2" }],
    });
    expect(tree).toEqual({ kind: "complete", shas: new Map([["b.md", "b2"]]) });
  });
});

describe("getFileNamesIn", () => {
  const shas = new Map([
    ["tasks/a.md", "1"],
    ["tasks/b.md", "2"],
    ["tasks/archive/c.md", "3"],
    ["tasks-old/d.md", "4"],
    ["writing/blog/ideas/walk.md", "5"],
  ]);

  it("直下のファイルだけを返し、サブディレクトリと名前が前方一致する別のディレクトリは含めない", () => {
    expect(getFileNamesIn(shas, "tasks")).toEqual(["a.md", "b.md"]);
  });

  it("深いディレクトリも読める", () => {
    expect(getFileNamesIn(shas, "writing/blog/ideas")).toEqual(["walk.md"]);
  });

  it("無いディレクトリは空", () => {
    expect(getFileNamesIn(shas, "projects")).toEqual([]);
  });
});
