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

test("今日の画面で送った投稿は、送り終えると入力欄を空にし、夜の一覧に出る", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, new Map());
  await page.goto("./");
  const field = page.getByRole("textbox", { name: "いまのこと" });
  await field.fill("夕日がきれい");
  await page.getByRole("button", { name: "送る", exact: true }).click();
  await expect(page.getByText("21:00 に投稿しました")).toBeVisible();
  await expect(field).toHaveValue("");

  await page.getByRole("button", { name: "夜" }).click();
  await expect(page.getByRole("region", { name: "今日の投稿" }).getByText("夕日がきれい")).toBeVisible();
});
