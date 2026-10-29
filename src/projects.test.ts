import { describe, expect, it } from "vitest";
import { createProjectNameLoader, readFrontmatterValue } from "./projects";

describe("readFrontmatterValue", () => {
  it("frontmatter のキーの値を返し、引用符を外す", () => {
    const text = "---\ntitle: 請求書\nproject: polaris\nname: \"Polaris Mobile\"\n---\n\n# 本文\nproject: body\n";
    expect(readFrontmatterValue(text, "project")).toBe("polaris");
    expect(readFrontmatterValue(text, "name")).toBe("Polaris Mobile");
  });

  it("CRLF でも読む", () => {
    expect(readFrontmatterValue("---\r\nproject: a\r\n---\r\n", "project")).toBe("a");
  });

  it("frontmatter やキーが無い、または空なら undefined", () => {
    expect(readFrontmatterValue("# 本文\nproject: a\n", "project")).toBeUndefined();
    expect(readFrontmatterValue("---\nproject: a\n", "project")).toBeUndefined();
    expect(readFrontmatterValue("---\ntitle: a\n---\nproject: b\n", "project")).toBeUndefined();
    expect(readFrontmatterValue("---\nproject:   \n---\n", "project")).toBeUndefined();
    expect(readFrontmatterValue("---\nproject: \"\"\n---\n", "project")).toBeUndefined();
  });

  it("前方一致の別キーは拾わない", () => {
    expect(readFrontmatterValue("---\nproject_id: x\n---\n", "project")).toBeUndefined();
  });
});

const fakeRead = (files: Record<string, string>, failing: ReadonlySet<string> = new Set()) => {
  const calls: string[] = [];
  const read = async (path: string): Promise<string | undefined> => {
    calls.push(path);
    if (failing.has(path)) {
      throw new Error("offline");
    }
    return files[path];
  };
  return { read, calls };
};

describe("createProjectNameLoader", () => {
  const files = {
    "tasks/t1.md": "---\nproject: polaris\n---\n",
    "tasks/t2.md": "---\nproject: polaris\n---\n",
    "tasks/t3.md": "---\nproject: missing\n---\n",
    "tasks/t4.md": "---\ntitle: プロジェクトなし\n---\n",
    "projects/polaris.md": "---\nname: Polaris\n---\n",
  };

  it("task の project から projects の name を引く", async () => {
    const { read } = fakeRead(files);
    const nameOf = createProjectNameLoader(read);
    expect(await nameOf("t1")).toBe("Polaris");
  });

  it("同じファイルは 1 回しか読まない", async () => {
    const { read, calls } = fakeRead(files);
    const nameOf = createProjectNameLoader(read);
    const names = await Promise.all([nameOf("t1"), nameOf("t2"), nameOf("t1")]);
    expect(names).toEqual(["Polaris", "Polaris", "Polaris"]);
    expect([...calls].sort()).toEqual(["projects/polaris.md", "tasks/t1.md", "tasks/t2.md"]);
  });

  it("ファイルが無い、project が無い、読めないときは undefined を返して例外を投げない", async () => {
    const { read } = fakeRead(files, new Set(["tasks/t2.md"]));
    const nameOf = createProjectNameLoader(read);
    expect(await nameOf("none")).toBeUndefined();
    expect(await nameOf("t3")).toBeUndefined();
    expect(await nameOf("t4")).toBeUndefined();
    expect(await nameOf("t2")).toBeUndefined();
  });

  it("読めなかったファイルは次に呼ばれたとき読み直す", async () => {
    const failing = new Set(["projects/polaris.md"]);
    const { read, calls } = fakeRead(files, failing);
    const nameOf = createProjectNameLoader(read);
    expect(await nameOf("t1")).toBeUndefined();
    failing.clear();
    expect(await nameOf("t1")).toBe("Polaris");
    expect(calls.filter((path) => path === "projects/polaris.md")).toHaveLength(2);
    expect(calls.filter((path) => path === "tasks/t1.md")).toHaveLength(1);
  });

  it("別のファイルを指す ID は読まない", async () => {
    const { read, calls } = fakeRead({ ...files, "tasks/evil.md": "---\nproject: ../daily/x\n---\n" });
    const nameOf = createProjectNameLoader(read);
    expect(await nameOf("../daily/2026-10-29")).toBeUndefined();
    expect(await nameOf("evil")).toBeUndefined();
    expect(calls).toEqual(["tasks/evil.md"]);
  });
});
