import { expect, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

const date = "2026-10-31";
const journal = `---
date: ${date}
---

- 08:00 散歩した
- 08:00 散歩した
`;

test.beforeEach(async ({ page }) => {
  // 4:00 の日付境界に左右されないよう、時計を固定する。
  await page.clock.setFixedTime(new Date(`${date}T21:00:00+09:00`));
});

test("同じ時刻と文の投稿が 2 件あっても、両方を一覧に出す", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map([[`journal/${date}.md`, journal]]));
  await page.goto("./");
  await page.getByRole("button", { name: "夜" }).click();
  const posts = page.getByRole("region", { name: "今日の投稿" });
  await expect(posts.getByText("2 件")).toBeVisible();
  await expect(posts.getByRole("listitem")).toHaveCount(2);
});

test("日記を保存すると、投稿の一覧を読み直す", async ({ page }) => {
  await configure(page);
  const files = new Map([[`journal/${date}.md`, journal]]);
  const puts = await mockGitHub(page, files);
  await page.goto("./");
  await page.getByRole("button", { name: "夜" }).click();
  const posts = page.getByRole("region", { name: "今日の投稿" });
  await expect(posts.getByRole("listitem")).toHaveCount(2);

  // 夜の画面を開いた後に、別の端末から投稿が増えたことにする。
  files.set(`journal/${date}.md`, `${journal}- 20:00 夕飯を作った\n`);
  await page.getByRole("textbox", { name: "日記" }).fill("よく歩いた");
  await page.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => puts.length).toBe(1);
  await expect(posts.getByRole("listitem")).toHaveCount(3);
  await expect(posts.getByText("夕飯を作った")).toBeVisible();
});

test("夜の画面で送った投稿は、送り終えると入力欄を空にし、一覧に出る", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map());
  await page.goto("./");
  await page.getByRole("button", { name: "夜" }).click();
  const field = page.getByRole("textbox", { name: "いまのこと" });
  await field.fill("夕日がきれい");
  await page.getByRole("button", { name: "送る", exact: true }).click();
  await expect(page.getByText("21:00 に投稿しました")).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(page.getByRole("region", { name: "今日の投稿" }).getByText("夕日がきれい")).toBeVisible();
});

const dailyWithDone = `---
date: ${date}
plan_at: ${date}T06:00:00+09:00
review_at:
---

## 今日の時間割
| 時刻 | やること | 誰 | 実績 |
| --- | --- | --- | --- |
| 07:00–07:30 | 散歩 | あなた | |
| 09:00–18:00 | 仕事 | | 10:00 から |

## あなたの番 (3 つまで)
- [x] 小説の構想を音声で入れる
- [ ] 散歩

## 振り返り (夜に書く)
`;

test("振り返りの上に、実績を書いたコマとチェックした「あなたの番」を並べる", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map([[`daily/${date}.md`, dailyWithDone]]));
  await page.goto("./");
  await page.getByRole("button", { name: "夜" }).click();
  const done = page.getByRole("region", { name: "今日やったこと" });
  await expect(done.getByRole("listitem")).toHaveCount(2);
  await expect(done.getByText("10:00 から")).toBeVisible();
  await expect(done.getByText("小説の構想を音声で入れる")).toBeVisible();
  await expect(done.getByText("散歩")).toHaveCount(0);
});

test("daily が無ければ、今日の記録はまだないと出す", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map());
  await page.goto("./");
  await page.getByRole("button", { name: "夜" }).click();
  const done = page.getByRole("region", { name: "今日やったこと" });
  await expect(done.getByText("今日の記録はまだありません。")).toBeVisible();
});
