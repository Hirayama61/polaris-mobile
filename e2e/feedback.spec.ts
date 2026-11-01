import { expect, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

const date = "2026-10-31";

test.beforeEach(async ({ page }) => {
  // 4:00 の日付境界に左右されないよう、時計を固定する。
  await page.clock.setFixedTime(new Date(`${date}T09:00:00+09:00`));
});

test("要望シートの送信を連打しても、inbox に書いたままのメモを 1 件だけ作る", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, new Map());
  await page.goto("./");
  await page.getByRole("button", { name: "思いつきを送る" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "タイトル" }).fill("チェックした項目を下に回したい");
  await dialog.getByRole("textbox", { name: /^詳しく/ }).fill("終わったものが上に残ると探しにくい");
  await dialog.getByRole("button", { name: "送信" }).click({ clickCount: 3 });
  await expect(dialog.getByRole("status")).toContainText("に書きました。");
  expect(puts).toHaveLength(1);
  expect(puts[0]?.path).toMatch(/^inbox\/20261031-[0-9a-z]+\.md$/);
  expect(puts[0]?.sha).toBeUndefined();
  expect(puts[0]?.content).toMatch(
    /^---\ncreated: 2026-10-31T09:00:00\+09:00\n---\n\nチェックした項目を下に回したい\n\n終わったものが上に残ると探しにくい\n\n送信元: 今日 \/ 2026-10-31 \/ v.+\n$/,
  );
});
