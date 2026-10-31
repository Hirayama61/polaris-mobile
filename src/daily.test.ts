import { describe, expect, it } from "vitest";
import {
  countSameScheduleRows,
  createMinimalDaily,
  extractReview,
  extractReviewAt,
  extractSchedule,
  extractTurns,
  extractWakeAt,
  findSameScheduleRow,
  insertScheduleRow,
  isScheduleTime,
  parseDaily,
  removeScheduleRow,
  setReview,
  setReviewAt,
  setScheduleActual,
  setScheduleRow,
  setTurnChecked,
  setWakeAt,
  splitScheduleTime,
  toggleTurn,
  toScheduleTime,
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

// 「実績」列と wake_at を持つ新しい形式の daily。
const fixtureWithActual = `---
date: 2026-10-31
plan_at: 2026-10-31T06:00:00+09:00
wake_at:
review_at:
---

## 今日の時間割
| 時刻 | やること | 誰 | 実績 |
| --- | --- | --- | --- |
| 07:00–07:30 | 散歩 | あなた | |
| 09:00–18:00 | 仕事 | | 10:00 から |

## あなたの番 (3 つまで)
- [ ] 散歩

## 振り返り (夜に書く)
`;

const lines = (text: string): readonly string[] => text.split("\n");

// 指定した行以外が元の全文と一致することを確かめる。
const expectOnlyLinesChanged = (before: string, after: string, changedLines: readonly number[]): void => {
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
        line: 9,
        time: "07:00–07:30",
        what: "Google アカウントを作る (task: 20261025-oubf)",
        who: "あなた",
        actual: undefined,
      },
      { line: 10, time: "09:00–18:00", what: "仕事", who: "", actual: undefined },
    ]);
  });

  it("「実績」列があれば各行のセルを返す", () => {
    expect(extractSchedule(fixtureWithActual)).toEqual([
      { line: 10, time: "07:00–07:30", what: "散歩", who: "あなた", actual: "" },
      { line: 11, time: "09:00–18:00", what: "仕事", who: "", actual: "10:00 から" },
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
    expect(lines(after)[13]).toBe("- [x] Google アカウントを作る (task: 20261025-oubf)");
    expectOnlyLinesChanged(fixture, after, [13]);
  });

  it("2 回切り替えると元に戻る", () => {
    expect(toggleTurn(toggleTurn(fixture, 14), 14)).toBe(fixture);
  });

  it("setTurnChecked は同じ状態を指定しても全文を変えない", () => {
    expect(setTurnChecked(fixture, 13, false)).toBe(fixture);
    expect(setTurnChecked(toggleTurn(fixture, 13), 13, true)).toBe(toggleTurn(fixture, 13));
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

describe("setWakeAt", () => {
  it("frontmatter の wake_at だけを変える", () => {
    const after = setWakeAt(fixtureWithActual, "2026-10-31T06:42:10+09:00");
    expect(lines(after)[3]).toBe("wake_at: 2026-10-31T06:42:10+09:00");
    expectOnlyLinesChanged(fixtureWithActual, after, [3]);
    expect(extractWakeAt(after)).toBe("2026-10-31T06:42:10+09:00");
  });

  it("既に値があれば置き換える", () => {
    const once = setWakeAt(fixtureWithActual, "2026-10-31T06:00:00+09:00");
    const twice = setWakeAt(once, "2026-10-31T07:00:00+09:00");
    expect(extractWakeAt(twice)).toBe("2026-10-31T07:00:00+09:00");
    expectOnlyLinesChanged(fixtureWithActual, twice, [3]);
  });

  it("キーが無ければ frontmatter の末尾に足し、他の行は変えない", () => {
    const after = setWakeAt(fixture, "2026-10-30T06:30:00+09:00");
    expect(after).toBe(
      fixture.replace("review_at:\n---", "review_at:\nwake_at: 2026-10-30T06:30:00+09:00\n---"),
    );
    expect(extractReviewAt(after)).toBeUndefined();
  });

  it("frontmatter が無ければ全文を変えない", () => {
    expect(setWakeAt("## 振り返り\n", "2026-10-30T06:30:00+09:00")).toBe("## 振り返り\n");
  });
});

describe("setScheduleActual", () => {
  it("対象の行の「実績」セルだけを書き、他の行は 1 文字も変えない", () => {
    const after = setScheduleActual(fixtureWithActual, 10, "7:10 から 20 分");
    expect(lines(after)[10]).toBe("| 07:00–07:30 | 散歩 | あなた | 7:10 から 20 分 |");
    expectOnlyLinesChanged(fixtureWithActual, after, [10]);
    expect(extractSchedule(after)[0]?.actual).toBe("7:10 から 20 分");
  });

  it("既存の値を置き換え、空にすると空のセルに戻す", () => {
    const after = setScheduleActual(fixtureWithActual, 11, "");
    expect(lines(after)[11]).toBe("| 09:00–18:00 | 仕事 | | |");
    expectOnlyLinesChanged(fixtureWithActual, after, [11]);
    expect(setScheduleActual(setScheduleActual(fixtureWithActual, 10, "した"), 10, "")).toBe(
      fixtureWithActual,
    );
  });

  it("改行と | をセルを壊さない文字に置き換える", () => {
    const after = setScheduleActual(fixtureWithActual, 10, " 散歩 | 読書\n半分 ");
    expect(lines(after)[10]).toBe("| 07:00–07:30 | 散歩 | あなた | 散歩 ｜ 読書 半分 |");
    expect(extractSchedule(after)).toHaveLength(2);
  });

  it("末尾の | が無い行でも最後のセルだけを書く", () => {
    const text = fixtureWithActual.replace("| 仕事 | | 10:00 から |", "| 仕事 | | 10:00 から");
    const after = setScheduleActual(text, 11, "定時");
    expect(lines(after)[11]).toBe("| 09:00–18:00 | 仕事 | | 定時");
    expectOnlyLinesChanged(text, after, [11]);
  });

  it("「実績」列が無い表、表の行でない行、セルが無い行では全文を変えない", () => {
    expect(setScheduleActual(fixture, 9, "した")).toBe(fixture);
    expect(setScheduleActual(fixtureWithActual, 8, "した")).toBe(fixtureWithActual);
    expect(setScheduleActual(fixtureWithActual, 9, "した")).toBe(fixtureWithActual);
    expect(setScheduleActual(fixtureWithActual, 14, "した")).toBe(fixtureWithActual);
    expect(setScheduleActual(fixtureWithActual, 999, "した")).toBe(fixtureWithActual);
    const short = fixtureWithActual.replace("| 散歩 | あなた | |", "| 散歩 | あなた |");
    expect(setScheduleActual(short, 10, "した")).toBe(short);
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
    expect(setReview(text, "終わり")).toBe("---\ndate: 2026-10-30\n---\n\n## 振り返り\n\n終わり\n");
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
    const written = setReviewAt(setReview(text, "朝ジョブが無かった日"), "2026-10-30T22:00:00+09:00");
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
    expect(view.wakeAt).toBeUndefined();
  });
});

describe("isScheduleTime と toScheduleTime", () => {
  it("HH:MM–HH:MM の形だけを受け付ける", () => {
    expect(isScheduleTime("07:00–07:30")).toBe(true);
    expect(isScheduleTime("23:30–00:30")).toBe(true);
    expect(isScheduleTime("07:00-07:30")).toBe(false);
    expect(isScheduleTime("7:00–7:30")).toBe(false);
    expect(isScheduleTime("07:60–08:00")).toBe(false);
    expect(isScheduleTime("07:00–")).toBe(false);
    expect(isScheduleTime("")).toBe(false);
  });

  it("開始と終了を en dash でつなぎ、形が違えば undefined を返す", () => {
    expect(toScheduleTime("07:00", "07:30")).toBe("07:00–07:30");
    expect(toScheduleTime(" 07:00 ", "07:30")).toBe("07:00–07:30");
    expect(toScheduleTime("", "07:30")).toBeUndefined();
    expect(toScheduleTime("07:00", "")).toBeUndefined();
    expect(toScheduleTime("7:00", "07:30")).toBeUndefined();
  });
});

describe("splitScheduleTime", () => {
  it("開始と終了を 2 桁の HH:MM に分ける", () => {
    expect(splitScheduleTime("07:00–07:30")).toEqual({ start: "07:00", end: "07:30" });
    expect(splitScheduleTime("7:00 - 8:30")).toEqual({ start: "07:00", end: "08:30" });
  });

  it("読めなければ両方を空にする", () => {
    expect(splitScheduleTime("午前")).toEqual({ start: "", end: "" });
  });
});

describe("setScheduleRow", () => {
  it("対象の行の時刻とやることを書き、誰を「あなた」にし、実績のセルを残す", () => {
    const after = setScheduleRow(fixtureWithActual, 11, "09:30–17:30", "仕事 (在宅)");
    expect(lines(after)[11]).toBe("| 09:30–17:30 | 仕事 (在宅) | あなた | 10:00 から |");
    expectOnlyLinesChanged(fixtureWithActual, after, [11]);
  });

  it("「実績」列が無い表では 3 列のまま書く", () => {
    const after = setScheduleRow(fixture, 10, "18:00–19:00", "夕食");
    expect(lines(after)[10]).toBe("| 18:00–19:00 | 夕食 | あなた |");
    expectOnlyLinesChanged(fixture, after, [10]);
  });

  it("末尾の | が無い行でも 4 列目以降をそのまま残す", () => {
    const text = fixtureWithActual.replace("| 仕事 | | 10:00 から |", "| 仕事 | | 10:00 から");
    const after = setScheduleRow(text, 11, "09:00–18:00", "仕事");
    expect(lines(after)[11]).toBe("| 09:00–18:00 | 仕事 | あなた | 10:00 から");
    expectOnlyLinesChanged(text, after, [11]);
  });

  it("改行と | をセルを壊さない文字に置き換える", () => {
    const after = setScheduleRow(fixtureWithActual, 10, "07:00–07:30", " 散歩 | 体操\n軽く ");
    expect(lines(after)[10]).toBe("| 07:00–07:30 | 散歩 ｜ 体操 軽く | あなた | |");
    expect(extractSchedule(after)).toHaveLength(2);
  });

  it("表の行でない行では全文を変えない", () => {
    expect(setScheduleRow(fixtureWithActual, 8, "07:00–07:30", "x")).toBe(fixtureWithActual);
    expect(setScheduleRow(fixtureWithActual, 9, "07:00–07:30", "x")).toBe(fixtureWithActual);
    expect(setScheduleRow(fixtureWithActual, 14, "07:00–07:30", "x")).toBe(fixtureWithActual);
    expect(setScheduleRow(fixtureWithActual, 999, "07:00–07:30", "x")).toBe(fixtureWithActual);
  });
});

// 挿入した 1 行を除くと元の全文と一致することを確かめる。
const expectOnlyLineInserted = (before: string, after: string, insertedLine: number): void => {
  const afterLines = [...lines(after)];
  afterLines.splice(insertedLine, 1);
  expect(afterLines.join("\n")).toBe(before);
};

describe("insertScheduleRow", () => {
  it("開始時刻の順の位置に 1 行入れ、実績のセルは空にする", () => {
    const after = insertScheduleRow(fixtureWithActual, "08:00–08:30", "朝食");
    expect(lines(after)[11]).toBe("| 08:00–08:30 | 朝食 | あなた | |");
    expectOnlyLineInserted(fixtureWithActual, after, 11);
  });

  it("どの行より早ければ区切り行の直後に入れる", () => {
    const after = insertScheduleRow(fixtureWithActual, "06:00–06:30", "起床");
    expect(lines(after)[10]).toBe("| 06:00–06:30 | 起床 | あなた | |");
    expectOnlyLineInserted(fixtureWithActual, after, 10);
  });

  it("どの行より遅いか同じ開始時刻なら、表の末尾か同じ時刻の行の後ろに入れる", () => {
    const late = insertScheduleRow(fixtureWithActual, "21:00–22:00", "読書");
    expect(lines(late)[12]).toBe("| 21:00–22:00 | 読書 | あなた | |");
    expectOnlyLineInserted(fixtureWithActual, late, 12);
    const same = insertScheduleRow(fixtureWithActual, "07:00–07:10", "水を飲む");
    expect(lines(same)[11]).toBe("| 07:00–07:10 | 水を飲む | あなた | |");
    expectOnlyLineInserted(fixtureWithActual, same, 11);
  });

  it("「実績」列が無い表には列を足さない", () => {
    const after = insertScheduleRow(fixture, "08:00–08:30", "朝食");
    expect(lines(after)[10]).toBe("| 08:00–08:30 | 朝食 | あなた |");
    expectOnlyLineInserted(fixture, after, 10);
  });

  it("時間割の表が無ければ全文を変えない", () => {
    const text = "## 今日の時間割\n\n## あなたの番\n";
    expect(insertScheduleRow(text, "08:00–08:30", "朝食")).toBe(text);
    expect(insertScheduleRow("## 振り返り\n", "08:00–08:30", "朝食")).toBe("## 振り返り\n");
  });
});

describe("countSameScheduleRows", () => {
  it("時刻とやることが同じ行を数え、足した後は 1 つ増える", () => {
    expect(countSameScheduleRows(fixtureWithActual, "07:00–07:30", "散歩")).toBe(1);
    expect(countSameScheduleRows(fixtureWithActual, "08:00–08:30", "朝食")).toBe(0);
    const added = insertScheduleRow(fixtureWithActual, "08:00–08:30", "朝 | 食");
    expect(countSameScheduleRows(added, "08:00–08:30", "朝 | 食")).toBe(1);
  });
});

describe("removeScheduleRow", () => {
  it("対象の行だけを消す", () => {
    const after = removeScheduleRow(fixtureWithActual, 10);
    const expected = [...lines(fixtureWithActual)];
    expected.splice(10, 1);
    expect(after).toBe(expected.join("\n"));
    expect(extractSchedule(after).map(({ what }) => what)).toEqual(["仕事"]);
  });

  it("ヘッダー、区切り行、表の外の行では全文を変えない", () => {
    expect(removeScheduleRow(fixtureWithActual, 8)).toBe(fixtureWithActual);
    expect(removeScheduleRow(fixtureWithActual, 9)).toBe(fixtureWithActual);
    expect(removeScheduleRow(fixtureWithActual, 14)).toBe(fixtureWithActual);
    expect(removeScheduleRow(fixtureWithActual, 999)).toBe(fixtureWithActual);
  });
});

describe("findSameScheduleRow", () => {
  const [walk] = extractSchedule(fixtureWithActual);

  it("行番号がずれても、中身が同じ行を見つける", () => {
    const shifted = fixtureWithActual.replace("wake_at:", "wake_at: 2026-10-31T06:40:00+09:00\nnote: x");
    expect(walk).toBeDefined();
    expect(walk && findSameScheduleRow(shifted, walk)?.line).toBe(11);
  });

  it("時刻・やること・誰・実績のどれかが変わっていれば undefined を返す", () => {
    expect(walk).toBeDefined();
    if (walk === undefined) {
      return;
    }
    expect(findSameScheduleRow(setScheduleActual(fixtureWithActual, 10, "した"), walk)).toBeUndefined();
    expect(
      findSameScheduleRow(setScheduleRow(fixtureWithActual, 10, "07:00–07:40", "散歩"), walk),
    ).toBeUndefined();
    expect(findSameScheduleRow(removeScheduleRow(fixtureWithActual, 10), walk)).toBeUndefined();
  });
});
