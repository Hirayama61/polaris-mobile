import { expect, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

const date = "2026-10-31";

const daily = `---
date: ${date}
plan_at: ${date}T06:00:00+09:00
wake_at:
review_at:
---

## 今日の時間割
| 時刻 | やること | 誰 | 実績 |
| --- | --- | --- | --- |
| 07:00–07:30 | 散歩 | あなた | |
| 09:00–18:00 | 仕事 | | |

## あなたの番 (3 つまで)
- [ ] 散歩
- [ ] 小説の構想を音声で入れる

## Claude が昨日やったこと
- なし

## 振り返り (夜に書く)

## 朝ジョブの記録
- ...
`;

// PUT の前後で変わった行の番号。行数が変わったら全行を変わったとみなす。
const changedLines = (before: string, after: string | undefined): number[] => {
  const beforeLines = before.split("\n");
  const afterLines = after?.split("\n") ?? [];
  if (afterLines.length !== beforeLines.length) {
    return beforeLines.map((_, index) => index);
  }
  return beforeLines.flatMap((line, index) => (line === afterLines[index] ? [] : [index]));
};

test.beforeEach(async ({ page }) => {
  // 4:00 の日付境界と「いま」の印に左右されないよう、時計を固定する。
  await page.clock.setFixedTime(new Date(`${date}T12:00:00+09:00`));
});

test("設定が無ければ今日の画面はトークンの設定を促す", async ({ page }) => {
  await mockGitHub(page, new Map());
  await page.goto("./");
  await page.getByRole("button", { name: "今日" }).click();
  await expect(page.getByText("GitHub のトークンが未設定です")).toBeVisible();
});

test("今日を開くと時間割だけが出て、先頭に起床のコマを足す", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "10月31日(土)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "あなたの番" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "いまのこと" })).toHaveCount(0);
  const timeline = page.getByRole("region", { name: "時間割" }).getByRole("listitem");
  await expect(timeline.first()).toContainText("起床");
  await expect(page.getByRole("textbox", { name: "09:00–18:00 の実績" })).toBeVisible();
  const unscheduled = page.getByRole("region", { name: "時間を決めていないこと" });
  await expect(unscheduled.getByRole("checkbox", { name: "散歩" })).toBeVisible();
  await expect(unscheduled.getByRole("checkbox", { name: "小説の構想を音声で入れる" })).toBeVisible();
});

test("チェックを 1 つ付けると、その行の [ ] だけが [x] になって PUT される", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("checkbox", { name: "散歩" }).check();
  await expect.poll(() => puts.length).toBe(1);
  expect(changedLines(daily, puts[0]?.content)).toEqual([daily.split("\n").indexOf("- [ ] 散歩")]);
  expect(puts[0]?.content.split("\n")[daily.split("\n").indexOf("- [ ] 散歩")]).toBe("- [x] 散歩");
});

test("起床のコマを開いて「起きた」を押すと、wake_at の行だけが変わる", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("button", { name: "起床" }).click();
  await page.getByRole("button", { name: "起きた" }).click();
  await expect(page.getByText("12:00 に起床")).toBeVisible();
  expect(puts).toHaveLength(1);
  expect(changedLines(daily, puts[0]?.content)).toEqual([daily.split("\n").indexOf("wake_at:")]);
});

test("起床を記録した後は時刻だけを出し、直すボタンを出さない", async ({ page }) => {
  await configure(page);
  const woke = daily.replace("wake_at:\n", `wake_at: ${date}T06:40:00+09:00\n`);
  await mockGitHub(page, new Map([[`daily/${date}.md`, woke]]));
  await page.goto("./");
  await page.getByRole("button", { name: "起床" }).click();
  await expect(page.getByText("06:40 に起床")).toBeVisible();
  await expect(page.getByRole("button", { name: "起きた" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "いまに直す" })).toHaveCount(0);
});

const taskDaily = daily
  .replace(
    "| 09:00–18:00 | 仕事 | | |",
    "| 09:00–18:00 | 仕事 | | |\n| 19:00–19:15 | 請求書 (task: 20261029-abcd) | あなた | |",
  )
  .replace(
    "- [ ] 小説の構想を音声で入れる",
    "- [ ] 小説の構想を音声で入れる\n- [ ] 請求書を送る: freee で出す (task: 20261029-abcd)",
  );

const task = `---
title: 請求書を送る
status: todo
assignee: human
---

## あなたがやること
- [ ] PDF を出す
- [ ] メールで送る
`;

test("task のコマにチェック欄を出し、切り替えると「あなたの番」の行だけが変わる", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, taskDaily]]));
  await page.goto("./");
  await expect(
    page.getByRole("region", { name: "時間を決めていないこと" }).getByRole("checkbox"),
  ).toHaveCount(2);
  await page.getByRole("region", { name: "時間割" }).getByRole("checkbox", { name: "請求書を送る" }).check();
  await expect.poll(() => puts.length).toBe(1);
  const turnLine = taskDaily.split("\n").indexOf("- [ ] 請求書を送る: freee で出す (task: 20261029-abcd)");
  expect(changedLines(taskDaily, puts[0]?.content)).toEqual([turnLine]);
});

test("task のコマをタップするとチェックリストを開く", async ({ page }) => {
  await configure(page);
  await mockGitHub(
    page,
    new Map([
      [`daily/${date}.md`, taskDaily],
      ["tasks/20261029-abcd.md", task],
    ]),
  );
  await page.goto("./");
  await page.getByRole("button", { name: /請求書/ }).click();
  await expect(page.getByRole("checkbox", { name: "PDF を出す" })).toBeVisible();
  await expect(page.getByText("freee で出す")).toBeVisible();
});

test("質問のコマをタップすると回答のシートを開く", async ({ page }) => {
  await configure(page);
  const question = task.replace("title: 請求書を送る", "title: 質問: 請求書の送り先");
  await mockGitHub(
    page,
    new Map([
      [`daily/${date}.md`, taskDaily],
      ["tasks/20261029-abcd.md", question],
    ]),
  );
  await page.goto("./");
  await page.getByRole("button", { name: /請求書/ }).click();
  await expect(page.getByRole("dialog").getByText("請求書の送り先")).toBeVisible();
});

test("4:00 をまたぐと、保存していない実績の入力を捨てる", async ({ page }) => {
  const nextDate = "2026-11-01";
  const nextDaily = daily.replaceAll(date, nextDate);
  await configure(page);
  const puts = await mockGitHub(
    page,
    new Map([
      [`daily/${date}.md`, daily],
      [`daily/${nextDate}.md`, nextDaily],
    ]),
  );
  await page.goto("./");
  await page.getByRole("textbox", { name: "09:00–18:00 の実績" }).fill("前日の実績");

  await page.clock.setFixedTime(new Date(`${nextDate}T12:00:00+09:00`));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "11月1日(日)" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "09:00–18:00 の実績" })).toHaveValue("");
  expect(puts).toEqual([]);
});

test("コマを直すと、その行の時刻・やること・誰だけが変わって PUT される", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("button", { name: "09:00–18:00 のコマを直す" }).click();
  const sheet = page.getByRole("dialog", { name: "コマを直す" });
  await sheet.getByLabel("開始").fill("09:30");
  await sheet.getByLabel("やること").fill("仕事 (在宅)");
  await sheet.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => puts.length).toBe(1);
  const line = daily.split("\n").indexOf("| 09:00–18:00 | 仕事 | | |");
  expect(changedLines(daily, puts[0]?.content)).toEqual([line]);
  expect(puts[0]?.content.split("\n")[line]).toBe("| 09:30–18:00 | 仕事 (在宅) | あなた | |");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "09:30–18:00 の実績" })).toBeVisible();
});

test("時刻を空にして保存すると、その場で知らせて PUT しない", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("button", { name: "07:00–07:30 のコマを直す" }).click();
  const sheet = page.getByRole("dialog", { name: "コマを直す" });
  await sheet.getByLabel("終了").fill("");
  await sheet.getByRole("button", { name: "保存" }).click();
  await expect(sheet.getByRole("alert")).toContainText("開始と終了の時刻");
  expect(puts).toEqual([]);
});

test("コマを足すと、時刻の順の位置に 1 行だけ入る", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("button", { name: "コマを足す" }).click();
  const sheet = page.getByRole("dialog", { name: "コマを足す" });
  await sheet.getByLabel("開始").fill("08:00");
  await sheet.getByLabel("終了").fill("08:30");
  await sheet.getByLabel("やること").fill("朝食");
  await sheet.getByRole("button", { name: "足す" }).click();
  await expect.poll(() => puts.length).toBe(1);
  const before = daily.split("\n");
  const at = before.indexOf("| 09:00–18:00 | 仕事 | | |");
  const expected = [...before.slice(0, at), "| 08:00–08:30 | 朝食 | あなた | |", ...before.slice(at)];
  expect(puts[0]?.content).toBe(expected.join("\n"));
});

test("コマを消すと、その行だけがなくなる", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("button", { name: "09:00–18:00 のコマを直す" }).click();
  await page
    .getByRole("dialog", { name: "コマを直す" })
    .getByRole("button", { name: "このコマを消す" })
    .click();
  await expect.poll(() => puts.length).toBe(1);
  const expected = daily.split("\n").filter((line) => line !== "| 09:00–18:00 | 仕事 | | |");
  expect(puts[0]?.content).toBe(expected.join("\n"));
});

test("完了して終わったコマは 1 行に畳み、終わっていないコマは今までどおり出す", async ({ page }) => {
  const doneDaily = daily
    .replace("| 07:00–07:30 | 散歩 | あなた | |", "| 07:00–07:30 | 散歩 | あなた | 完了 |")
    .replace("| 09:00–18:00 | 仕事 | | |", "| 09:00–18:00 | 仕事 | | 完了 |");
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, doneDaily]]));
  await page.goto("./");
  const folded = page.getByRole("button", { name: "07:00–07:30 散歩 完了" });
  await expect(folded).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("textbox", { name: "07:00–07:30 の実績" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "07:00–07:30 のコマを直す" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "09:00–18:00 の実績" })).toHaveValue("完了");
  expect(puts).toEqual([]);
});

test("畳んだコマをタップすると中身が開き、daily には書き込まない", async ({ page }) => {
  const doneDaily = daily.replace(
    "| 07:00–07:30 | 散歩 | あなた | |",
    "| 07:00–07:30 | 散歩 | あなた | 完了 |",
  );
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, doneDaily]]));
  await page.goto("./");
  await page.getByRole("button", { name: "07:00–07:30 散歩 完了" }).click();
  await expect(page.getByRole("textbox", { name: "07:00–07:30 の実績" })).toHaveValue("完了");
  await expect(page.getByRole("button", { name: "07:00–07:30 のコマを直す" })).toBeVisible();
  expect(puts).toEqual([]);
});

test("終わったコマの実績を「完了」で保存すると、PUT した後に 1 行に畳む", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  const actual = page.getByRole("textbox", { name: "07:00–07:30 の実績" });
  await actual.fill("完了");
  await actual.press("Enter");
  await expect.poll(() => puts.length).toBe(1);
  const line = daily.split("\n").indexOf("| 07:00–07:30 | 散歩 | あなた | |");
  expect(changedLines(daily, puts[0]?.content)).toEqual([line]);
  await expect(page.getByRole("button", { name: "07:00–07:30 散歩 完了" })).toBeVisible();
  await expect(actual).toHaveCount(0);
});
