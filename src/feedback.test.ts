import { describe, expect, it } from "vitest";
import { buildInboxNote, buildInboxPath, clearSentDraft, inboxSuffix } from "./feedback";

const context = { screenLabel: "夜", date: "2026-10-30", version: "0.1.0" };
const created = "2026-10-30T22:15:00+09:00";

describe("buildInboxNote", () => {
  it("frontmatter は created だけで、タイトル、本文、送信元を空行で区切る", () => {
    expect(buildInboxNote({ title: "保存ボタンを上に", body: "夜に押しにくい" }, context, created)).toBe(
      "---\ncreated: 2026-10-30T22:15:00+09:00\n---\n\n保存ボタンを上に\n\n夜に押しにくい\n\n送信元: 夜 / 2026-10-30 / v0.1.0\n",
    );
  });

  it("前後の空白を取り除き、本文内部の改行は残す", () => {
    expect(buildInboxNote({ title: " 題 ", body: "\n 1 行目\n2 行目 \n\n" }, context, created)).toBe(
      "---\ncreated: 2026-10-30T22:15:00+09:00\n---\n\n題\n\n1 行目\n2 行目\n\n送信元: 夜 / 2026-10-30 / v0.1.0\n",
    );
  });

  it("本文が空なら本文の段落を省く", () => {
    expect(buildInboxNote({ title: "題", body: "  \n" }, context, created)).toBe(
      "---\ncreated: 2026-10-30T22:15:00+09:00\n---\n\n題\n\n送信元: 夜 / 2026-10-30 / v0.1.0\n",
    );
  });
});

describe("buildInboxPath", () => {
  it("created の日付と 4 文字から inbox のパスを作る", () => {
    expect(buildInboxPath(created, "a7k2")).toBe("inbox/20261030-a7k2.md");
  });
});

describe("inboxSuffix", () => {
  it("base36 の 4 文字を作る", () => {
    expect(inboxSuffix(() => 0)).toBe("0000");
    expect(inboxSuffix(() => 0.9999999)).toBe("zzzz");
    const values = [0, 10 / 36, 35 / 36, 1 / 36];
    expect(inboxSuffix(() => values.shift() ?? 0)).toBe("0az1");
  });
});

describe("clearSentDraft", () => {
  const sent = { title: "保存ボタンを上に", body: "夜に押しにくい" };

  it("送信した内容のままなら空にする", () => {
    expect(clearSentDraft({ ...sent }, sent)).toEqual({ title: "", body: "" });
  });

  it("送信中や送信後に書き換えられた書きかけは消さない", () => {
    const next = { title: "別の要望", body: "" };
    expect(clearSentDraft(next, sent)).toBe(next);
    const appended = { title: sent.title, body: `${sent.body}。追記` };
    expect(clearSentDraft(appended, sent)).toBe(appended);
  });
});
