import { describe, expect, it } from "vitest";
import {
  createProjectNameLoader,
  linkifyIssueRefs,
  loadProjects,
  parseProject,
  parseProjectBody,
  readFrontmatterValue,
  sortProjects,
  stripFrontmatter,
} from "./projects";

describe("readFrontmatterValue", () => {
  it("frontmatter のキーの値を返し、引用符を外す", () => {
    const text =
      '---\ntitle: 請求書\nproject: polaris\nname: "Polaris Mobile"\n---\n\n# 本文\nproject: body\n';
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
    expect(readFrontmatterValue('---\nproject: ""\n---\n', "project")).toBeUndefined();
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

describe("parseProject", () => {
  it("name、status、kind、github と frontmatter を除いた本文を読む", () => {
    const text =
      "---\nname: Polaris\nstatus: retired\nkind: code\ngithub: Hirayama61/polaris\n---\n\n## 目指すもの\n本文\n";
    expect(parseProject("polaris", text)).toEqual({
      slug: "polaris",
      name: "Polaris",
      isRetired: true,
      status: "retired",
      kind: "code",
      github: "Hirayama61/polaris",
      body: "## 目指すもの\n本文\n",
    });
  });

  it("name が無ければ slug を名前にし、owner/name の形でない github は使わない", () => {
    const project = parseProject("x", "---\ngithub: javascript:alert(1)\n---\n本文");
    expect(project.name).toBe("x");
    expect(project.isRetired).toBe(false);
    expect(project.status).toBeUndefined();
    expect(project.kind).toBeUndefined();
    expect(project.github).toBeUndefined();
  });
});

describe("stripFrontmatter", () => {
  it("frontmatter が無い、または閉じていなければ全体を返す", () => {
    expect(stripFrontmatter("# 本文\n")).toBe("# 本文\n");
    expect(stripFrontmatter("---\nname: a\n")).toBe("---\nname: a\n");
  });
});

describe("sortProjects", () => {
  it("retired を末尾に回し、それぞれ名前順に並べる", () => {
    const make = (name: string, isRetired: boolean) => ({
      slug: name,
      name,
      isRetired,
      status: undefined,
      kind: undefined,
      github: undefined,
      body: "",
    });
    const sorted = sortProjects([make("c", true), make("b", false), make("a", true), make("a2", false)]);
    expect(sorted.map(({ name }) => name)).toEqual(["a2", "b", "a", "c"]);
  });
});

describe("linkifyIssueRefs", () => {
  it("#N を github の Issue に、(PR: URL) をその URL にする", () => {
    expect(linkifyIssueRefs("#12 一覧を作る (PR: https://github.com/o/r/pull/13)", "o/r")).toEqual([
      { kind: "link", text: "#12", href: "https://github.com/o/r/issues/12" },
      { kind: "text", text: " 一覧を作る (PR: " },
      { kind: "link", text: "https://github.com/o/r/pull/13", href: "https://github.com/o/r/pull/13" },
      { kind: "text", text: ")" },
    ]);
  });

  it("github が無ければ #N は文字のまま", () => {
    expect(linkifyIssueRefs("#3 済み", undefined)).toEqual([{ kind: "text", text: "#3 済み" }]);
  });

  it("github.com 以外の URL や、語の途中の # はリンクにしない", () => {
    expect(linkifyIssueRefs("a#1 (PR: javascript:alert(1)) C#2", "o/r")).toEqual([
      { kind: "text", text: "a#1 (PR: javascript:alert(1)) C#2" },
    ]);
  });
});

describe("parseProjectBody", () => {
  it("「## Issue の状況」節の中だけをリンクにする", () => {
    const body =
      "## 目指すもの\n#1 はリンクにしない\n\n## Issue の状況\n- #2 作る\n### 細目\n- #3 直す\n## メモ\n- #4\n";
    expect(parseProjectBody(body, "o/r")).toEqual([
      { kind: "heading", level: 2, segments: [{ kind: "text", text: "目指すもの" }] },
      { kind: "text", segments: [{ kind: "text", text: "#1 はリンクにしない" }] },
      { kind: "blank" },
      { kind: "heading", level: 2, segments: [{ kind: "text", text: "Issue の状況" }] },
      {
        kind: "item",
        segments: [
          { kind: "link", text: "#2", href: "https://github.com/o/r/issues/2" },
          { kind: "text", text: " 作る" },
        ],
      },
      { kind: "heading", level: 3, segments: [{ kind: "text", text: "細目" }] },
      {
        kind: "item",
        segments: [
          { kind: "link", text: "#3", href: "https://github.com/o/r/issues/3" },
          { kind: "text", text: " 直す" },
        ],
      },
      { kind: "heading", level: 2, segments: [{ kind: "text", text: "メモ" }] },
      { kind: "item", segments: [{ kind: "text", text: "#4" }] },
    ]);
  });
});

describe("loadProjects", () => {
  it("projects/*.md だけを読み、retired を末尾にして返す。書き込みはしない", async () => {
    const { read, calls } = fakeRead({
      "projects/b.md": "---\nname: B\n---\n",
      "projects/a.md": "---\nname: A\nstatus: retired\n---\n",
    });
    const listed: string[] = [];
    const list = async (path: string) => {
      listed.push(path);
      return ["b.md", "a.md", "README.txt", "..md", "gone.md"];
    };
    const projects = await loadProjects(list, read);
    expect(projects.map(({ name }) => name)).toEqual(["B", "A"]);
    expect(listed).toEqual(["projects"]);
    expect([...calls].sort()).toEqual(["projects/a.md", "projects/b.md", "projects/gone.md"]);
  });

  it("読めないファイルがあれば例外にする", async () => {
    const { read } = fakeRead({}, new Set(["projects/a.md"]));
    await expect(loadProjects(async () => ["a.md"], read)).rejects.toThrow("offline");
  });
});
