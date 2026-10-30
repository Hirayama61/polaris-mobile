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

test("今日を開くと daily の「あなたの番」と時間割が出る", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "10月31日(土)" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "散歩" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "小説の構想を音声で入れる" })).toBeVisible();
  await expect(page.getByText("残り 2")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "09:00–18:00 の実績" })).toBeVisible();
});

test("チェックを 1 つ付けると、その行の [ ] だけが [x] になって PUT される", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  await page.getByRole("checkbox", { name: "散歩" }).check();
  await expect(page.getByText("残り 1")).toBeVisible();
  await expect.poll(() => puts.length).toBe(1);

  const [put] = puts;
  expect(put?.path).toBe(`daily/${date}.md`);
  const before = daily.split("\n");
  const after = put?.content.split("\n") ?? [];
  expect(after).toHaveLength(before.length);
  const changed = before.flatMap((line, index) => (line === after[index] ? [] : [index]));
  expect(changed).toEqual([before.indexOf("- [ ] 散歩")]);
  expect(after[before.indexOf("- [ ] 散歩")]).toBe("- [x] 散歩");
});
