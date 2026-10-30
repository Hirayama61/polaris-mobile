import { describe, expect, it } from "vitest";
import {
  groupInboxByProject,
  hasUnansweredQuestion,
  type InboxItem,
  isNewSince,
  loadInbox,
  toInboxItem,
} from "./inbox";

const question = (id: string, title: string, answered: boolean, projectName?: string): InboxItem => ({
  kind: "question",
  id,
  title,
  answered,
  projectName,
  created: undefined,
});

const task = (id: string, title: string, projectName?: string): InboxItem => ({
  kind: "task",
  id,
  title,
  projectName,
  created: undefined,
});

describe("toInboxItem", () => {
  it("todo の質問は接頭辞を外し、回答の有無を付ける", () => {
    const text =
      "---\ntitle: 質問: どちらにする\nstatus: todo\ncreated: 2026-10-30T09:00:00+09:00\n---\n\n## 回答\n\nA\n";
    expect(toInboxItem("q1", text)).toEqual({
      kind: "question",
      id: "q1",
      title: "どちらにする",
      answered: true,
      created: "2026-10-30T09:00:00+09:00",
    });
  });

  it("人の todo はタスクにする", () => {
    const text = "---\ntitle: 鍵を作る\nassignee: human\nstatus: todo\n---\n";
    expect(toInboxItem("t1", text)).toEqual({
      kind: "task",
      id: "t1",
      title: "鍵を作る",
      created: undefined,
    });
  });

  it("Claude のタスクと済んだタスクは出さない", () => {
    expect(toInboxItem("t2", "---\ntitle: 調べる\nassignee: claude\nstatus: todo\n---\n")).toBeUndefined();
    expect(toInboxItem("t3", "---\ntitle: 鍵\nassignee: human\nstatus: done\n---\n")).toBeUndefined();
    expect(toInboxItem("q2", "---\ntitle: 質問: 済み\nstatus: done\n---\n")).toBeUndefined();
  });
});

describe("groupInboxByProject", () => {
  it("project 名の順に分け、project の無いものは末尾に置く", () => {
    const groups = groupInboxByProject([
      task("t1", "一"),
      task("t2", "二", "Polaris"),
      task("t3", "三", "Blog"),
    ]);
    expect(groups.map((group) => group.projectName)).toEqual(["Blog", "Polaris", undefined]);
  });

  it("見出しの中は未回答の質問、回答済みの質問、タスクの順に並べる", () => {
    const groups = groupInboxByProject([
      task("t1", "あ", "P"),
      question("q1", "い", true, "P"),
      question("q2", "う", false, "P"),
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["q2", "q1", "t1"]);
  });
});

describe("isNewSince", () => {
  const seenAt = "2026-10-30T09:00:00+09:00";

  it("前に開いた時刻より後に作られたものだけを新着にする", () => {
    expect(isNewSince("2026-10-30T09:00:01+09:00", seenAt)).toBe(true);
    expect(isNewSince("2026-10-30T09:00:00+09:00", seenAt)).toBe(false);
    expect(isNewSince("2026-10-30T08:59:00+09:00", seenAt)).toBe(false);
  });

  it("時差の違う書き方でも時刻で比べる", () => {
    expect(isNewSince("2026-10-30T00:30:00Z", seenAt)).toBe(true);
  });

  it("初めて開くとき、created が無いか読めないときは新着にしない", () => {
    expect(isNewSince("2026-10-30T10:00:00+09:00", undefined)).toBe(false);
    expect(isNewSince(undefined, seenAt)).toBe(false);
    expect(isNewSince("あした", seenAt)).toBe(false);
  });
});

describe("hasUnansweredQuestion", () => {
  it("未回答の質問があるときだけ true", () => {
    expect(hasUnansweredQuestion([task("t1", "一"), question("q1", "二", false)])).toBe(true);
    expect(hasUnansweredQuestion([task("t1", "一"), question("q1", "二", true)])).toBe(false);
    expect(hasUnansweredQuestion([])).toBe(false);
  });
});

describe("loadInbox", () => {
  it("質問とタスクに project 名を付けて返し、project は 1 回だけ読む", async () => {
    const files: Record<string, string> = {
      "tasks/q1.md": "---\ntitle: 質問: 一\nproject: polaris\nstatus: todo\n---\n\n## 回答\n\n(未回答)\n",
      "tasks/t1.md": "---\ntitle: 二\nproject: polaris\nassignee: human\nstatus: todo\n---\n",
      "tasks/t2.md": "---\ntitle: 三\nproject: polaris\nassignee: claude\nstatus: todo\n---\n",
      "projects/polaris.md": "---\nname: Polaris\n---\n",
    };
    const calls: string[] = [];
    const items = await loadInbox(
      async () => ["q1.md", "t1.md", "t2.md", "README.txt", "..%2Fx.md"],
      async (path) => {
        calls.push(path);
        return files[path];
      },
    );
    expect(items).toEqual([
      {
        kind: "question",
        id: "q1",
        title: "一",
        answered: false,
        projectName: "Polaris",
        created: undefined,
      },
      { kind: "task", id: "t1", title: "二", projectName: "Polaris", created: undefined },
    ]);
    expect(calls.filter((path) => path.startsWith("projects/"))).toEqual(["projects/polaris.md"]);
  });

  it("tasks の一覧を読めなければ例外", async () => {
    await expect(
      loadInbox(
        async () => {
          throw new Error("401");
        },
        async () => undefined,
      ),
    ).rejects.toThrow("401");
  });
});
