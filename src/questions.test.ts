import { describe, expect, it } from "vitest";
import {
  collectOpenQuestions,
  extractSection,
  openQuestionTitle,
  replaceAnswer,
  taskIdOf,
} from "./questions";

const task = [
  "---",
  "title: 質問: 日記の置き場所",
  "status: todo",
  "updated: 2026-10-29",
  "---",
  "",
  "## 質問",
  "",
  "日記をどこに置くか。",
  "",
  "## 選択肢",
  "",
  "- A: journal/",
  "- B: daily/",
  "",
  "## 回答",
  "",
  "",
  "## メモ",
  "",
  "### 小見出し",
  "残す",
  "",
].join("\n");

// 書き換え後のファイルから「## 回答」節の中身の行を除いたもの。他の行が変わっていないことを比べる。
const withoutAnswerBody = (text: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf("## 回答");
  const end = lines.findIndex((line, index) => index > start && /^#{1,2}(\s|$)/.test(line));
  return [...lines.slice(0, start + 1), ...(end === -1 ? [] : lines.slice(end))];
};

describe("openQuestionTitle", () => {
  it("title が 質問: で始まり status: todo なら、接頭辞を外したタイトルを返す", () => {
    expect(openQuestionTitle(task)).toBe("日記の置き場所");
  });

  it("質問でないか todo でなければ undefined", () => {
    expect(openQuestionTitle(task.replace("title: 質問: ", "title: "))).toBeUndefined();
    expect(openQuestionTitle(task.replace("status: todo", "status: done"))).toBeUndefined();
    expect(openQuestionTitle("## 質問\n本文だけ\n")).toBeUndefined();
  });

  it("引用符つきの title も読む", () => {
    expect(openQuestionTitle(task.replace("title: 質問: 日記の置き場所", 'title: "質問: 日記"'))).toBe(
      "日記",
    );
  });
});

describe("taskIdOf", () => {
  it(".md のファイル名から ID を返し、path に使えない名前は弾く", () => {
    expect(taskIdOf("t-20261029-a.md")).toBe("t-20261029-a");
    expect(taskIdOf("README")).toBeUndefined();
    expect(taskIdOf("..md")).toBeUndefined();
    expect(taskIdOf(".hidden.md")).toBeUndefined();
  });
});

describe("extractSection", () => {
  it("節の中身を前後の空行を除いて返す", () => {
    expect(extractSection(task, "質問")).toBe("日記をどこに置くか。");
    expect(extractSection(task, "選択肢")).toBe("- A: journal/\n- B: daily/");
    expect(extractSection(task, "回答")).toBe("");
  });

  it("### は節の中身に含め、無い節は undefined", () => {
    expect(extractSection(task, "メモ")).toBe("### 小見出し\n残す");
    expect(extractSection(task, "背景")).toBeUndefined();
  });

  it("コードブロックの中の見出しでは節を切らない", () => {
    const text = "## 質問\n\n```\n## 回答\n```\n続き\n\n## 回答\n\nA\n";
    expect(extractSection(text, "質問")).toBe("```\n## 回答\n```\n続き");
    expect(extractSection(text, "回答")).toBe("A");
  });
});

describe("replaceAnswer", () => {
  it("途中の節を書き換え、他の行は変えない", () => {
    const written = replaceAnswer(task, "A");
    expect(extractSection(written, "回答")).toBe("A");
    expect(withoutAnswerBody(written)).toEqual(withoutAnswerBody(task));
    expect(written).toContain("## 回答\n\nA\n\n## メモ\n");
  });

  it("既にある回答を置き換える", () => {
    const once = replaceAnswer(task, "A");
    const twice = replaceAnswer(once, "B にする\n理由は短く");
    expect(extractSection(twice, "回答")).toBe("B にする\n理由は短く");
    expect(withoutAnswerBody(twice)).toEqual(withoutAnswerBody(task));
  });

  it("末尾の節を書き換え、末尾の改行を残す", () => {
    const text = "---\ntitle: 質問: x\nstatus: todo\n---\n\n## 質問\n\nどうする\n\n## 回答\n\n(未回答)\n";
    const written = replaceAnswer(text, "C");
    expect(written).toBe("---\ntitle: 質問: x\nstatus: todo\n---\n\n## 質問\n\nどうする\n\n## 回答\n\nC\n");
  });

  it("節が無ければ末尾に足し、それまでの内容は変えない", () => {
    const text = "---\ntitle: 質問: x\nstatus: todo\n---\n\n## 質問\n\nどうする";
    const written = replaceAnswer(text, "A");
    expect(written).toBe(`${text}\n\n## 回答\n\nA\n`);
    expect(replaceAnswer(`${text}\n`, "A")).toBe(`${text}\n\n## 回答\n\nA\n`);
    expect(replaceAnswer(`${text}\n\n`, "A")).toBe(`${text}\n\n## 回答\n\nA\n`);
  });

  it("CRLF のファイルは CRLF のまま書き換える", () => {
    const crlf = task.replaceAll("\n", "\r\n");
    const written = replaceAnswer(crlf, "A");
    expect(written).toBe(replaceAnswer(task, "A").replaceAll("\n", "\r\n"));
  });

  it("前後の空白を落とし、空なら中身を空にする", () => {
    expect(extractSection(replaceAnswer(task, "  A  \n"), "回答")).toBe("A");
    const cleared = replaceAnswer(replaceAnswer(task, "A"), "   ");
    expect(cleared).toContain("## 回答\n\n## メモ\n");
    expect(withoutAnswerBody(cleared)).toEqual(withoutAnswerBody(task));
  });

  it("同じ回答を 2 回書いても結果は変わらない", () => {
    const once = replaceAnswer(task, "A");
    expect(replaceAnswer(once, "A")).toBe(once);
  });
});

describe("collectOpenQuestions", () => {
  it("未回答の質問だけを ID 順に集め、.md 以外は読まない", async () => {
    const files: Record<string, string> = {
      b: task,
      a: task.replace("日記の置き場所", "通知"),
      c: task.replace("status: todo", "status: done"),
      d: "---\ntitle: 請求書\nstatus: todo\n---\n",
    };
    const reads: string[] = [];
    const items = await collectOpenQuestions(
      ["b.md", "c.md", "d.md", "a.md", "README", "e.md"],
      async (id) => {
        reads.push(id);
        return files[id];
      },
      2,
    );
    expect(items).toEqual([
      { id: "a", title: "通知" },
      { id: "b", title: "日記の置き場所" },
    ]);
    expect(reads.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("読めないファイルがあれば例外にする", async () => {
    await expect(
      collectOpenQuestions(["a.md"], async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
