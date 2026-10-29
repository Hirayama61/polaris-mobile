import { describe, expect, it } from "vitest";
import {
  addDoubt,
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

  it("コードブロックの中の見出しは節の始まりにしないが、節の終わりにはする", () => {
    const text = "## 質問\n\n```\n## 回答\n```\n続き\n\n## 回答\n\nA\n";
    expect(extractSection(text, "質問")).toBe("```");
    expect(extractSection(text, "回答")).toBe("A");
  });
});

describe("replaceAnswer", () => {
  it("回答の中のフェンスにある見出しで節を切り、後ろの行は 1 文字も消さない", () => {
    const cases: [string, string][] = [
      ["## 回答\n\n```\n~~~\n", "## 例\n```\n\n## メモ\n\n残す\n"],
      ["## 回答\n\n````\n```\n", "## 例\n````\n\n## メモ\n\n残す\n"],
      ["## 回答\n\nA\n\n```\n    ```\n", "## 例\n   ```\n\n## メモ\n\n残す\n"],
      ["## 回答\n\nA\n\n    ```\n\n", "## メモ\n\n残す\n\n    ```\n"],
      ["## 回答\n\n```foo```\n\n", "## メモ\n\n残す\n\n```\ncode\n```\n"],
    ];
    for (const [answer, rest] of cases) {
      expect(replaceAnswer(answer + rest, "B")).toBe(`## 回答\n\nB\n\n${rest}`);
    }
  });

  it("```foo``` の行は開きフェンスにせず、後ろの「## 回答」を見つける", () => {
    const text = "## 質問\n\n```foo```\n\n## 回答\n\nA\n\n## メモ\n\n```\ncode\n```\n";
    expect(replaceAnswer(text, "B")).toBe(text.replace("\nA\n", "\nB\n"));
  });

  it("字下げした見出しでも節を切り、後ろの節を残す", () => {
    const text = "## 回答\n\nA\n\n  ## メモ\n\n残す\n   # 大見出し\n";
    expect(replaceAnswer(text, "B")).toBe("## 回答\n\nB\n\n  ## メモ\n\n残す\n   # 大見出し\n");
    expect(extractSection("## 回答\n\nA\n    ## コード\n", "回答")).toBe("A\n    ## コード");
  });

  it("閉じていないフェンスの回答を書いても、次の保存で後ろの節を残す", () => {
    const text = "## 回答\n\n(未回答)\n\n## メモ\n\n残す\n";
    const once = replaceAnswer(text, "```\nコード");
    expect(once).toBe("## 回答\n\n\\```\nコード\n\n## メモ\n\n残す\n");
    expect(replaceAnswer(once, "B")).toBe(text.replace("(未回答)", "B"));
  });

  it("回答に書いたフェンスが後ろの節のフェンスと対にならず、次の保存で後ろの節を残す", () => {
    const text = "## 回答\n\n(未回答)\n\n## メモ\n\n```\nコード\n```\n";
    const once = replaceAnswer(text, "```");
    expect(once).toBe("## 回答\n\n\\```\n\n## メモ\n\n```\nコード\n```\n");
    expect(replaceAnswer(once, "A")).toBe(text.replace("(未回答)", "A"));
    expect(replaceAnswer(text, "  ~~~~")).toContain("## 回答\n\n\\~~~~\n\n## メモ");
  });

  it("回答に書いた見出しの行は新しい節にせず、回答の中に残す", () => {
    const written = replaceAnswer(task, "A\n## 理由\n# 大見出し\n### 小見出し");
    expect(extractSection(written, "回答")).toBe("A\n\\## 理由\n\\# 大見出し\n### 小見出し");
    expect(withoutAnswerBody(written)).toEqual(withoutAnswerBody(task));
    expect(replaceAnswer(written, extractSection(written, "回答") ?? "")).toBe(written);
  });

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

describe("addDoubt", () => {
  const base = [
    "---",
    "title: Google アカウントを作る",
    "status: todo",
    "---",
    "",
    "## 疑問点",
    "- 名前は本名か",
    "",
    "## 調べたこと",
    "本名でなくてよい。",
    "",
  ].join("\n");

  // 既存の行は 1 つも変えず、足した行だけが増えていることを確かめる。
  const removeAdded = (after: string, added: readonly number[]): string =>
    after
      .split("\n")
      .filter((_, index) => !added.includes(index))
      .join("\n");

  it("節の最後の項目の次に 1 行だけ足す", () => {
    const after = addDoubt(base, "電話番号は要るか");
    expect(after.split("\n")[7]).toBe("- 電話番号は要るか");
    expect(removeAdded(after, [7])).toBe(base);
  });

  it("節が無ければ末尾に作る", () => {
    const text = "---\ntitle: a\n---\n\n本文\n";
    expect(addDoubt(text, "なぜ")).toBe("---\ntitle: a\n---\n\n本文\n\n## 疑問点\n\n- なぜ\n");
    expect(addDoubt("本文", "なぜ")).toBe("本文\n\n## 疑問点\n\n- なぜ\n");
    expect(addDoubt("本文\n\n", "なぜ")).toBe("本文\n\n## 疑問点\n\n- なぜ\n");
  });

  it("中身の無い節は見出しの次に足し、後ろの見出しを離す", () => {
    expect(addDoubt("## 疑問点\n## 調べたこと\nx\n", "a")).toBe("## 疑問点\n\n- a\n\n## 調べたこと\nx\n");
    expect(addDoubt("## 疑問点\n\n## 調べたこと\n", "a")).toBe("## 疑問点\n\n- a\n\n## 調べたこと\n");
    expect(addDoubt("## 疑問点", "a")).toBe("## 疑問点\n\n- a");
  });

  it("最後の節でも末尾の空行の前に足す", () => {
    expect(addDoubt("## 疑問点\n- a\n\n\n", "b")).toBe("## 疑問点\n- a\n- b\n\n\n");
  });

  it("改行は空白にし、空なら何も変えない", () => {
    expect(addDoubt(base, "  一行目\n二行目  ").split("\n")[7]).toBe("- 一行目 二行目");
    expect(addDoubt(base, " \n ")).toBe(base);
  });

  it("コードブロックの中の見出しは節にしない", () => {
    const text = "```\n## 疑問点\n```\n";
    expect(addDoubt(text, "a")).toBe("```\n## 疑問点\n```\n\n## 疑問点\n\n- a\n");
  });

  it("CRLF の行末を揃える", () => {
    expect(addDoubt("## 疑問点\r\n- a\r\n", "b")).toBe("## 疑問点\r\n- a\r\n- b\r\n");
  });
});
