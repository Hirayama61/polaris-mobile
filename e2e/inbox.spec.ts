import { expect, type Locator, type Page, test } from "@playwright/test";
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

const longTitle = "受信箱の一覧で、タイトルが長いときに横の印が改行されずに同じ位置へ並ぶかを確かめる";

const answered = (id: string, title: string): string => `---
id: ${id}
title: "質問: ${title}"
assignee: human
status: todo
---

## 質問
${title}

## 回答
A
`;

test("幅 375px で長いタイトルの行も、回答済みの印は 1 行のまま短い行と同じ位置に並ぶ", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await configure(page);
  await mockGitHub(
    page,
    new Map([
      ["tasks/20261031-q2.md", answered("20261031-q2", longTitle)],
      ["tasks/20261031-q3.md", answered("20261031-q3", "短い質問")],
    ]),
  );
  await page.goto("./");
  await page.getByRole("button", { name: /^受信箱/ }).click();

  const longTag = page.getByRole("button", { name: new RegExp(longTitle) }).getByText("回答済み");
  const shortTag = page.getByRole("button", { name: /短い質問/ }).getByText("回答済み");
  const longBox = await longTag.boundingBox();
  const shortBox = await shortTag.boundingBox();
  if (longBox === null || shortBox === null) {
    throw new Error("回答済みの印が表示されていない");
  }
  // 印の高さと幅が短い行と同じなら、改行も縮みもしていない。右端が同じなら同じ位置に並んでいる。
  expect(longBox.height).toBeCloseTo(shortBox.height, 0);
  expect(longBox.width).toBeCloseTo(shortBox.width, 0);
  expect(longBox.x + longBox.width).toBeCloseTo(shortBox.x + shortBox.width, 0);
});

const openTask = async (page: Page): Promise<Locator> => {
  await page.getByRole("button", { name: /^受信箱/ }).click();
  await page.getByRole("button", { name: /Google アカウントを作る/ }).click();
  return page.getByRole("dialog");
};

test("タスクのシートで項目にチェックを付けると、tasks のその行だけが [x] になる", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  const dialog = await openTask(page);
  const checkbox = dialog.getByRole("checkbox", { name: "電話番号で確認する" });
  await checkbox.click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toBe("tasks/20261029-t1.md");
  expect(puts[0]?.content).toBe(task.replace("- [ ] 電話番号で確認する", "- [x] 電話番号で確認する"));
  await expect(checkbox).toBeChecked();
});

test("タスクのシートで疑問点を足すと、「## 疑問点」に 1 行だけ足して一覧に出す", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  const dialog = await openTask(page);
  await dialog.getByRole("textbox", { name: "疑問点" }).fill("どの電話番号を使うか");
  await dialog.getByRole("button", { name: "足す" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toBe("tasks/20261029-t1.md");
  expect(puts[0]?.content).toBe(`${task}\n## 疑問点\n\n- [ ] どの電話番号を使うか\n`);
  await expect(dialog.getByRole("listitem").filter({ hasText: "どの電話番号を使うか" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "疑問点" })).toHaveValue("");
});

test("全部チェックしたタスクを完了にすると、status と updated だけを書き換え、一覧から外す", async ({
  page,
}) => {
  const checkedTask = task.replace("- [ ] 電話番号で確認する", "- [x] 電話番号で確認する");
  await configure(page);
  const puts = await mockGitHub(page, new Map([["tasks/20261029-t1.md", checkedTask]]));
  await page.goto("./");
  const dialog = await openTask(page);
  await dialog.getByRole("button", { name: "完了にする" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toBe("tasks/20261029-t1.md");
  expect(puts[0]?.content).toBe(
    checkedTask.replace("status: todo\n", `status: done\nupdated: ${date}T09:00:00+09:00\n`),
  );
  await expect(dialog.getByText("いまあなたのタスクはありません。")).toBeVisible();
});

test("質問に A で答えて保存すると、「## 回答」だけを書き換え、一覧で回答済みにする", async ({ page }) => {
  await configure(page);
  const puts = await mockGitHub(page, files());
  await page.goto("./");
  await page.getByRole("button", { name: /^受信箱/ }).click();
  await page.getByRole("button", { name: /受信箱のタブはどこに置く/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "A", exact: true }).click();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.path).toBe("tasks/20261030-q1.md");
  expect(puts[0]?.content).toBe(question.replace("## 回答\n(未回答)\n", "## 回答\n\nA\n"));
  await expect(
    dialog.getByRole("button", { name: /受信箱のタブはどこに置く/ }).getByText("回答済み"),
  ).toBeVisible();
});
