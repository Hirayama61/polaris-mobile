import { expect, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

const outline = `---
created: 2026-10-29
---

# 朝の散歩を続けるコツ

## 構成

- 始めたきっかけ

## 一言
`;

const draft = `---
status: draft
---

# PWA を GitHub だけで動かす

本文。
`;

const files = (): Map<string, string> =>
  new Map([
    ["writing/blog/ideas/walk.md", "---\nstatus: new\n---\n"],
    ["writing/blog/outline/walk.md", outline],
    ["writing/blog/draft/pwa.md", draft],
  ]);

test("記事を段階つきで並べ、outline の一言だけを書き換えて保存する", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: "ブログ" }).click();

  const walk = page.getByRole("button", { name: /朝の散歩を続けるコツ/ });
  await expect(walk).toContainText("一言待ち");
  await expect(page.getByRole("button", { name: /PWA を GitHub だけで動かす/ })).toContainText("下書き");

  await walk.click();
  await page.getByRole("textbox", { name: /一言/ }).fill("体験談を厚めに。");
  await page.getByRole("button", { name: "一言を保存" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toBe("writing/blog/outline/walk.md");
  expect(puts[0]?.content).toBe(outline.replace("## 一言\n", "## 一言\n\n体験談を厚めに。\n"));
  await expect(page.getByText("一言を保存しました")).toBeVisible();
  await expect(page.getByText("下書き待ち")).toBeVisible();
});

test("draft に URL を入れて公開済みにする", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: "ブログ" }).click();
  await page.getByRole("button", { name: /PWA を GitHub だけで動かす/ }).click();

  const url = page.getByRole("textbox", { name: "公開した記事の URL" });
  await url.fill("example.com");
  await expect(page.getByRole("button", { name: "公開した" })).toBeDisabled();
  await url.fill("https://example.com/pwa");
  await page.getByRole("button", { name: "公開した" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toBe("writing/blog/draft/pwa.md");
  expect(puts[0]?.content).toBe(
    draft.replace("status: draft\n", "status: done\nurl: https://example.com/pwa\n"),
  );
  await expect(page.getByText("公開", { exact: true })).toBeVisible();
});

test("新しいアイデアの導線から思いつきのシートを開く", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: "ブログ" }).click();
  await page.getByRole("main").getByRole("button", { name: "思いつきを送る" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
