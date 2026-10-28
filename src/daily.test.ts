import { describe, expect, it } from "vitest";
import {
  createMinimalDaily,
  extractReview,
  extractReviewAt,
  extractSchedule,
  extractTurns,
  parseDaily,
  setReview,
  setReviewAt,
  setTurnChecked,
  toggleTurn,
} from "./daily";

// 朝ジョブが生成する daily の契約。1 文字も変えずにフィクスチャとして使う。
const fixture = `---
date: 2026-10-30
plan_at: 2026-10-30T06:00:00+09:00
review_at:
---

## 今日の時間割
| 時刻 | やること | 誰 |
| --- | --- | --- |
| 07:00–07:30 | Google アカウントを作る (task: 20261025-oubf) | あなた |
| 09:00–18:00 | 仕事 | |

## あなたの番 (3 つまで)
- [ ] Google アカウントを作る (task: 20261025-oubf)
- [ ] 小説の構想を音声で入れる

## Claude が昨日やったこと
- なし

## 振り返り (夜に書く)

## 朝ジョブの記録
- ...
`;

const lines = (text: string): readonly string[] => text.split("\n");

// 指定した行以外が元の全文と一致することを確かめる。
const expectOnlyLinesChanged = (
  before: string,
  after: string,
  changedLines: readonly number[],
): void => {
  const beforeLines = lines(before);
  const afterLines = lines(after);
  expect(afterLines.length).toBe(beforeLines.length);
  beforeLines.forEach((line, index) => {
    if (!changedLines.includes(index)) {
      expect(afterLines[index]).toBe(line);
    }
  });
};

describe("extractSchedule", () => {
  it("ヘッダーと区切り行を除いた表の行を返す", () => {
    expect(extractSchedule(fixture)).toEqual([
      {
        time: "07:00–07:30",
        what: "Google アカウントを作る (task: 20261025-oubf)",
        who: "あなた",
      },
      { time: "09:00–18:00", what: "仕事", who: "" },
    ]);
  });

  it("節が無ければ空配列を返す", () => {
    expect(extractSchedule("---\ndate: 2026-10-30\n---\n")).toEqual([]);
  });
});

describe("extractTurns", () => {
  it("括弧つきの見出しでも先頭の語で節を見つける", () => {
    expect(extractTurns(fixture)).toEqual([
      {
        line: 13,
        isChecked: false,
        label: "Google アカウントを作る (task: 20261025-oubf)",
      },
      { line: 14, isChecked: false, label: "小説の構想を音声で入れる" },
    ]);
  });

  it("他の節のチェックボックスは拾わない", () => {
    const text = `${fixture}\n## おまけ\n- [ ] 拾わない\n`;
    expect(extractTurns(text)).toHaveLength(2);
  });
});

describe("toggleTurn / setTurnChecked", () => {
  it("対象の行だけを [x] にし、他の行は 1 文字も変えない", () => {
    const after = toggleTurn(fixture, 13);
    expect(lines(after)[13]).toBe(
      "- [x] Google アカウントを作る (task: 20261025-oubf)",
    );
    expectOnlyLinesChanged(fixture, after, [13]);
  });

  it("2 回切り替えると元に戻る", () => {
    expect(toggleTurn(toggleTurn(fixture, 14), 14)).toBe(fixture);
  });

  it("setTurnChecked は同じ状態を指定しても全文を変えない", () => {
    expect(setTurnChecked(fixture, 13, false)).toBe(fixture);
    expect(setTurnChecked(toggleTurn(fixture, 13), 13, true)).toBe(
      toggleTurn(fixture, 13),
    );
  });

  it("チェック項目でない行を指定しても全文を変えない", () => {
    expect(toggleTurn(fixture, 0)).toBe(fixture);
    expect(toggleTurn(fixture, 999)).toBe(fixture);
  });
});

describe("setReviewAt", () => {
  it("frontmatter の review_at だけを変える", () => {
    const after = setReviewAt(fixture, "2026-10-30T22:15:00+09:00");
    expect(lines(after)[3]).toBe("review_at: 2026-10-30T22:15:00+09:00");
    expectOnlyLinesChanged(fixture, after, [3]);
    expect(extractReviewAt(after)).toBe("2026-10-30T22:15:00+09:00");
  });

  it("既に値があれば上書きする", () => {
    const once = setReviewAt(fixture, "2026-10-30T22:00:00+09:00");
    const twice = setReviewAt(once, "2026-10-30T23:00:00+09:00");
    expect(extractReviewAt(twice)).toBe("2026-10-30T23:00:00+09:00");
    expectOnlyLinesChanged(fixture, twice, [3]);
  });

  it("キーが無ければ frontmatter の末尾に追加する", () => {
    const text = "---\ndate: 2026-10-30\n---\n\n## 振り返り\n";
    expect(setReviewAt(text, "2026-10-30T22:00:00+09:00")).toBe(
      "---\ndate: 2026-10-30\nreview_at: 2026-10-30T22:00:00+09:00\n---\n\n## 振り返り\n",
    );
  });

  it("本文の review_at: は触らない", () => {
    const text = `${fixture}review_at: ここは本文\n`;
    const after = setReviewAt(text, "2026-10-30T22:00:00+09:00");
    expect(after.endsWith("review_at: ここは本文\n")).toBe(true);
  });
});

describe("setReview", () => {
  it("振り返り節の本文だけを書き、前後の節は 1 文字も変えない", () => {
    const after = setReview(fixture, "よく寝た。\n明日は早起き。");
    expect(after).toBe(
      fixture.replace(
        "## 振り返り (夜に書く)\n\n## 朝ジョブの記録",
        "## 振り返り (夜に書く)\n\nよく寝た。\n明日は早起き。\n\n## 朝ジョブの記録",
      ),
    );
    expect(extractReview(after)).toBe("よく寝た。\n明日は早起き。");
  });

  it("既存の本文を置き換える", () => {
    const once = setReview(fixture, "一度目");
    const twice = setReview(once, "二度目");
    expect(twice).toBe(setReview(fixture, "二度目"));
  });

  it("空文字列にすると元のフィクスチャに戻る", () => {
    expect(setReview(setReview(fixture, "一度目"), "")).toBe(fixture);
  });

  it("最後の節でもファイル末尾を改行 1 つで終える", () => {
    const text = "---\ndate: 2026-10-30\n---\n\n## 振り返り\n\n";
    expect(setReview(text, "終わり")).toBe(
      "---\ndate: 2026-10-30\n---\n\n## 振り返り\n\n終わり\n",
    );
  });

  it("節が無ければ末尾に追加する", () => {
    const text = "---\ndate: 2026-10-30\n---\n\n## 今日の時間割\n| a | b |\n";
    expect(setReview(text, "追記")).toBe(
      "---\ndate: 2026-10-30\n---\n\n## 今日の時間割\n| a | b |\n\n## 振り返り\n\n追記\n",
    );
  });
});

describe("createMinimalDaily", () => {
  it("振り返りと review_at を書ける最小の daily を作る", () => {
    const text = createMinimalDaily("2026-10-30");
    const written = setReviewAt(
      setReview(text, "朝ジョブが無かった日"),
      "2026-10-30T22:00:00+09:00",
    );
    expect(written).toBe(
      "---\ndate: 2026-10-30\nplan_at:\nreview_at: 2026-10-30T22:00:00+09:00\n---\n\n## 振り返り\n\n朝ジョブが無かった日\n",
    );
  });
});

describe("parseDaily", () => {
  it("表示に必要な内容をまとめて返す", () => {
    const view = parseDaily(fixture);
    expect(view.schedule).toHaveLength(2);
    expect(view.turns).toHaveLength(2);
    expect(view.review).toBe("");
    expect(view.reviewAt).toBeUndefined();
  });
});
