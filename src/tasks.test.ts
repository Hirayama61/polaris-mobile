import { describe, expect, it } from "vitest";
import {
  completeTask,
  extractChecklist,
  isHumanTodo,
  loadHumanTasks,
  setChecklistItem,
  sortHumanTasks,
} from "./tasks";

const task = `---
id: 20261025-oubf
title: Google アカウントを作る
project: polaris
assignee: human
status: todo
created: 2026-10-25T10:00:00+09:00
updated: 2026-10-26T09:00:00+09:00
---

# Google アカウントを作る

## 背景
- [ ] 背景の中のチェックは対象外

## あなたがやること
- [ ] accounts.google.com を開く
- [x] 名前を決める
  - [ ] 入れ子も項目にする
本文の行

### 補足
- [ ] 小見出しの中も節の続き

## メモ
- [ ] メモは対象外
`;

const changedLines = (before: string, after: string): number[] => {
  const a = before.split("\n");
  const b = after.split("\n");
  expect(b.length).toBe(a.length);
  return a.flatMap((line, index) => (line === b[index] ? [] : [index]));
};

describe("isHumanTodo", () => {
  it("assignee: human かつ status: todo だけを通す", () => {
    expect(isHumanTodo(task)).toBe(true);
    expect(isHumanTodo(task.replace("assignee: human", "assignee: claude"))).toBe(false);
    expect(isHumanTodo(task.replace("status: todo", "status: done"))).toBe(false);
  });

  it("title が 質問: で始まるものは除く", () => {
    expect(isHumanTodo(task.replace("title: Google", "title: 質問: Google"))).toBe(false);
  });
});

describe("extractChecklist", () => {
  it("「## あなたがやること」節のチェックだけを返す", () => {
    expect(extractChecklist(task)).toEqual([
      { line: 16, label: "accounts.google.com を開く", isChecked: false },
      { line: 17, label: "名前を決める", isChecked: true },
      { line: 18, label: "入れ子も項目にする", isChecked: false },
      { line: 22, label: "小見出しの中も節の続き", isChecked: false },
    ]);
  });

  it("節が無ければ空", () => {
    expect(extractChecklist("---\ntitle: a\n---\n\n- [ ] 節の外\n")).toEqual([]);
  });

  it("CRLF でも読む", () => {
    expect(extractChecklist("## あなたがやること\r\n- [X] 済み\r\n")).toEqual([
      { line: 1, label: "済み", isChecked: true },
    ]);
  });
});

describe("setChecklistItem", () => {
  it("対象行の角括弧だけを変え、他の行は変えない", () => {
    const checked = setChecklistItem(task, 16, true);
    expect(changedLines(task, checked)).toEqual([16]);
    expect(checked.split("\n")[16]).toBe("- [x] accounts.google.com を開く");

    const unchecked = setChecklistItem(task, 17, false);
    expect(changedLines(task, unchecked)).toEqual([17]);
    expect(unchecked.split("\n")[17]).toBe("- [ ] 名前を決める");
  });

  it("同じ状態にしても内容は変わらない", () => {
    expect(setChecklistItem(task, 17, true)).toBe(task);
  });

  it("本文中の [ ] は変えない", () => {
    const text = "## あなたがやること\n- [ ] 配列 [ ] を書く\n";
    expect(setChecklistItem(text, 1, true)).toBe("## あなたがやること\n- [x] 配列 [ ] を書く\n");
  });

  it("節の外や項目でない行を指したら何も変えない", () => {
    expect(setChecklistItem(task, 13, true)).toBe(task);
    expect(setChecklistItem(task, 26, true)).toBe(task);
    expect(setChecklistItem(task, 19, true)).toBe(task);
    expect(setChecklistItem(task, 999, true)).toBe(task);
  });

  it("CRLF の行末を残す", () => {
    const text = "## あなたがやること\r\n- [ ] a\r\n";
    expect(setChecklistItem(text, 1, true)).toBe("## あなたがやること\r\n- [x] a\r\n");
  });
});

describe("completeTask", () => {
  const now = "2026-10-29T15:20:00+09:00";

  it("status と updated の 2 行だけを変える", () => {
    const done = completeTask(task, now);
    expect(changedLines(task, done)).toEqual([5, 7]);
    expect(done.split("\n")[5]).toBe("status: done");
    expect(done.split("\n")[7]).toBe(`updated: ${now}`);
  });

  it("updated の引用符を残す", () => {
    const text = '---\nstatus: todo\nupdated: "2026-10-01T00:00:00+09:00"\n---\n';
    expect(completeTask(text, now)).toBe(`---\nstatus: done\nupdated: "${now}"\n---\n`);
  });

  it("updated が無ければ status の次に足し、他の行は変えない", () => {
    const text = "---\ntitle: a\nstatus: todo\nproject: p\n---\n\n本文\n";
    expect(completeTask(text, now)).toBe(`---\ntitle: a\nstatus: done\nupdated: ${now}\nproject: p\n---\n\n本文\n`);
  });

  it("本文の status: は変えない", () => {
    const text = "---\nstatus: todo\n---\nstatus: todo\nupdated: x\n";
    expect(completeTask(text, now)).toBe(`---\nstatus: done\nupdated: ${now}\n---\nstatus: todo\nupdated: x\n`);
  });

  it("CRLF の行末を残す", () => {
    const text = "---\r\nstatus: todo\r\nupdated: x\r\n---\r\n";
    expect(completeTask(text, now)).toBe(`---\r\nstatus: done\r\nupdated: ${now}\r\n---\r\n`);
  });

  it("frontmatter か status が無ければ何も変えない", () => {
    expect(completeTask("# 本文\nstatus: todo\n", now)).toBe("# 本文\nstatus: todo\n");
    expect(completeTask("---\ntitle: a\n---\n", now)).toBe("---\ntitle: a\n---\n");
    expect(completeTask("---\nstatus: todo\n", now)).toBe("---\nstatus: todo\n");
  });
});

describe("sortHumanTasks", () => {
  it("project 名の順、project の無いものは末尾", () => {
    const sorted = sortHumanTasks([
      { id: "c", title: "c", projectName: undefined },
      { id: "b", title: "b", projectName: "Polaris" },
      { id: "a", title: "a", projectName: "Polaris" },
      { id: "d", title: "d", projectName: "Alpha" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("loadHumanTasks", () => {
  it("人の todo に project 名を付けて返し、project は 1 回だけ読む", async () => {
    const files: Record<string, string> = {
      "tasks/t1.md": "---\ntitle: 一\nproject: polaris\nassignee: human\nstatus: todo\n---\n",
      "tasks/t2.md": "---\ntitle: 二\nproject: polaris\nassignee: human\nstatus: todo\n---\n",
      "tasks/t3.md": "---\ntitle: 三\nproject: polaris\nassignee: claude\nstatus: todo\n---\n",
      "tasks/t4.md": "---\ntitle: 質問: 四\nassignee: human\nstatus: todo\n---\n",
      "tasks/t5.md": "---\nproject: gone\nassignee: human\nstatus: todo\n---\n\n# 見出しの題\n",
      "projects/polaris.md": "---\nname: Polaris\n---\n",
    };
    const calls: string[] = [];
    const tasks = await loadHumanTasks(
      async () => ["t1.md", "t2.md", "t3.md", "t4.md", "t5.md", "README.txt", "..%2Fx.md"],
      async (path) => {
        calls.push(path);
        return files[path];
      },
    );
    expect(tasks).toEqual([
      { id: "t1", title: "一", projectName: "Polaris" },
      { id: "t2", title: "二", projectName: "Polaris" },
      { id: "t5", title: "見出しの題", projectName: undefined },
    ]);
    expect(calls.filter((path) => path === "projects/polaris.md")).toHaveLength(1);
  });

  it("project を読めなくても名前なしで返す", async () => {
    const tasks = await loadHumanTasks(
      async () => ["t1.md"],
      async (path) => {
        if (path.startsWith("projects/")) {
          throw new Error("offline");
        }
        return "---\ntitle: 一\nproject: p\nassignee: human\nstatus: todo\n---\n";
      },
    );
    expect(tasks).toEqual([{ id: "t1", title: "一", projectName: undefined }]);
  });
});
