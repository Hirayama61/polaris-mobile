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

test("アイデアを書くと ideas に書いたままのファイルを作り、構成待ちで並べる", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: "ブログ" }).click();
  await page.getByRole("main").getByRole("button", { name: "アイデアを書く" }).click();

  const body = "# お茶の淹れ方\n\n- 温度\n- 時間";
  await page.getByRole("dialog").getByRole("textbox", { name: "アイデア" }).fill(body);
  await page.getByRole("dialog").getByRole("button", { name: "送信" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toMatch(/^writing\/blog\/ideas\/\d{8}-[0-9a-z]{4}\.md$/);
  expect(puts[0]?.sha).toBeUndefined();
  expect(puts[0]?.content).toMatch(
    /^---\ncreated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00\nsource: mobile\nstatus: new\n---\n\n/,
  );
  expect(puts[0]?.content.endsWith(`---\n\n${body}\n`)).toBe(true);
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("に書きました");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "アイデア" })).toHaveValue("");

  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByRole("button", { name: /お茶の淹れ方/ })).toContainText("構成待ち");
});

test("アイデアの送信の応答を待つ間は、閉じるでも外側のタップでも Esc でも閉じない", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  // 後から登録した route が先に当たる。PUT だけ応答を止め、放したら mockGitHub に渡す。
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://api.github.com/**", async (route) => {
    if (route.request().method() === "PUT") {
      await gate;
    }
    await route.fallback();
  });
  await page.goto("./");
  await page.getByRole("button", { name: "ブログ" }).click();
  await page.getByRole("main").getByRole("button", { name: "アイデアを書く" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "アイデア" }).fill("# お茶の淹れ方");
  await dialog.getByRole("button", { name: "送信" }).click();
  await expect(dialog.getByRole("button", { name: "送信中…" })).toBeVisible();

  await expect(dialog.getByRole("button", { name: "閉じる" })).toBeDisabled();
  // シートは上端に出るので、外側として画面の下端を押す。
  const viewport = page.viewportSize();
  await page.mouse.click(10, (viewport?.height ?? 0) - 10);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  release();
  await expect(dialog.getByRole("status")).toContainText("に書きました");
  expect(puts).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("アイデアの書きかけは閉じても残り、思いつきのシートには混ざらない", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: "ブログ" }).click();
  await page.getByRole("main").getByRole("button", { name: "アイデアを書く" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "アイデア" }).fill("書きかけ");
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("banner").getByRole("button", { name: "思いつきを送る" }).click();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "タイトル" })).toHaveValue("");
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

  await page.reload();
  await page.getByRole("button", { name: "ブログ" }).click();
  await page.getByRole("main").getByRole("button", { name: "アイデアを書く" }).click();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "アイデア" })).toHaveValue("書きかけ");
  expect(puts).toHaveLength(0);
});
