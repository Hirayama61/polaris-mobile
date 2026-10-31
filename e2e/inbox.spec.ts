import { expect, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

const date = "2026-10-31";

const question = `---
id: 20261030-q1
title: "質問: 受信箱のタブはどこに置く"
assignee: human
status: todo
---

## 質問
受信箱のタブを、下のタブの何番目に置きますか。

## 選択肢
- A: 「今日」の右
- B: 「設定」の左

## 回答
(未回答)
`;

const task = `---
id: 20261029-t1
title: Google アカウントを作る
assignee: human
status: todo
---

## あなたがやること
- [ ] 電話番号で確認する
`;

const files = (): Map<string, string> =>
  new Map([
    ["tasks/20261030-q1.md", question],
    ["tasks/20261029-t1.md", task],
  ]);

test.beforeEach(async ({ page }) => {
  // 4:00 の日付境界に左右されないよう、時計を固定する。
  await page.clock.setFixedTime(new Date(`${date}T09:00:00+09:00`));
});

test("受信箱から開いた質問は、戻るとシートを閉じて受信箱に戻る", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: /^受信箱/ }).click();
  await page.getByRole("button", { name: /受信箱のタブはどこに置く/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("受信箱のタブを、下のタブの何番目に置きますか。")).toBeVisible();

  await dialog.getByRole("button", { name: "受信箱に戻る" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Google アカウントを作る/ })).toBeVisible();
});

test("受信箱から開いたタスクは、戻るとシートを閉じて受信箱に戻る", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: /^受信箱/ }).click();
  await page.getByRole("button", { name: /Google アカウントを作る/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: "電話番号で確認する" })).toBeVisible();

  await dialog.getByRole("button", { name: "受信箱に戻る" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /受信箱のタブはどこに置く/ })).toBeVisible();
});
