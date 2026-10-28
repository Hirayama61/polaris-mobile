import { describe, expect, it } from "vitest";
import { buildIssueBody, clearSentDraft, parseRepoSlug } from "./feedback";

const context = { screenLabel: "夜", date: "2026-10-30", version: "0.1.0" };

describe("buildIssueBody", () => {
  it("本文の後に空行を挟んで送信元を 1 行足す", () => {
    expect(buildIssueBody("保存ボタンを上にほしい", context)).toBe(
      "保存ボタンを上にほしい\n\n送信元: 夜 / 2026-10-30 / v0.1.0",
    );
  });

  it("本文の前後の空白を取り除き、内部の改行は残す", () => {
    expect(buildIssueBody("\n 1 行目\n2 行目 \n\n", context)).toBe(
      "1 行目\n2 行目\n\n送信元: 夜 / 2026-10-30 / v0.1.0",
    );
  });

  it("本文が空なら送信元の 1 行だけにする", () => {
    expect(buildIssueBody("  \n", context)).toBe("送信元: 夜 / 2026-10-30 / v0.1.0");
  });
});

describe("parseRepoSlug", () => {
  it("owner/repo を分ける", () => {
    expect(parseRepoSlug("Hirayama61/polaris-mobile")).toEqual({
      owner: "Hirayama61",
      repo: "polaris-mobile",
    });
  });

  it("前後の空白は無視する", () => {
    expect(parseRepoSlug("  Hirayama61/polaris.mobile_2 ")).toEqual({
      owner: "Hirayama61",
      repo: "polaris.mobile_2",
    });
  });

  it("形が違えば undefined を返す", () => {
    expect(parseRepoSlug("")).toBeUndefined();
    expect(parseRepoSlug("polaris-mobile")).toBeUndefined();
    expect(parseRepoSlug("a/b/c")).toBeUndefined();
    expect(parseRepoSlug("/repo")).toBeUndefined();
    expect(parseRepoSlug("owner/")).toBeUndefined();
    expect(parseRepoSlug("owner/..")).toBeUndefined();
    expect(parseRepoSlug("-owner/repo")).toBeUndefined();
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
