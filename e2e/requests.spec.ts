import { expect, type Page, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

const date = "2026-10-31";

const daily = `---
date: ${date}
wake_at:
review_at:
---

## 今日の時間割
| 時刻 | やること | 誰 | 実績 |
| --- | --- | --- | --- |
| 09:00–18:00 | 仕事 | | |

## あなたの番 (3 つまで)
- [ ] 散歩
`;

const TASK_COUNT = 30;

const taskId = (index: number): string => `20261030-t${String(index).padStart(2, "0")}`;

const task = (index: number): string => `---
id: ${taskId(index)}
title: 人のタスク ${index}
assignee: human
status: todo
---

## あなたがやること
- [ ] 手を動かす
`;

const files = (): Map<string, string> =>
  new Map([
    [`daily/${date}.md`, daily],
    ...Array.from({ length: TASK_COUNT }, (_, index): [string, string] => [
      `tasks/${taskId(index)}.md`,
      task(index),
    ]),
  ]);

type Traffic = { paths: string[]; peakBlobReads: number };

// mockGitHub の後に登録し、先に通して数えてから mockGitHub に渡す。blob は少し待たせて同時数を測る。
const countRequests = async (page: Page): Promise<Traffic> => {
  const traffic: Traffic = { paths: [], peakBlobReads: 0 };
  let blobReads = 0;
  await page.route("https://api.github.com/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    traffic.paths.push(pathname);
    const isBlob = pathname.includes("/git/blobs/");
    if (isBlob) {
      blobReads += 1;
      traffic.peakBlobReads = Math.max(traffic.peakBlobReads, blobReads);
      await new Promise((resolve) => setTimeout(resolve, 30));
      blobReads -= 1;
    }
    await route.fallback();
  });
  return traffic;
};

const openInbox = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /^受信箱/ }).click();
  await expect(page.getByRole("button", { name: new RegExp(`人のタスク ${TASK_COUNT - 1}$`) })).toBeVisible();
  await page.waitForLoadState("networkidle");
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00+09:00`));
});

test("タスク一覧を初めて開くと、tree と daily と各タスクの本文を 1 回ずつだけ読む", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  const traffic = await countRequests(page);
  await page.goto("./");
  await openInbox(page);

  expect(traffic.paths.length).toBeLessThanOrEqual(TASK_COUNT + 2);
  expect(traffic.paths.filter((path) => path.includes("/git/trees/"))).toHaveLength(1);
  expect(traffic.paths.filter((path) => path.includes("/git/blobs/"))).toHaveLength(TASK_COUNT);
});

test("何も変わっていなければ、開き直したときは tree と daily の 2 回だけ読む", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  const traffic = await countRequests(page);
  await page.goto("./");
  await openInbox(page);
  traffic.paths.length = 0;

  await page.reload();
  await openInbox(page);

  expect(traffic.paths).toHaveLength(2);
  expect(traffic.paths.filter((path) => path.includes("/git/trees/"))).toHaveLength(1);
  expect(traffic.paths.filter((path) => path.includes(`/contents/daily/${date}.md`))).toHaveLength(1);
});

test("書き換わったタスクだけを読み直す", async ({ page }) => {
  const remote = files();
  await configure(page);
  await mockGitHub(page, remote);
  const traffic = await countRequests(page);
  await page.goto("./");
  await openInbox(page);
  remote.set(`tasks/${taskId(0)}.md`, task(0).replace("人のタスク 0", "人のタスク 0 (直した)"));
  traffic.paths.length = 0;

  await page.reload();
  await openInbox(page);

  await expect(page.getByRole("button", { name: /人のタスク 0 \(直した\)/ })).toBeVisible();
  expect(traffic.paths.filter((path) => path.includes("/git/blobs/"))).toHaveLength(1);
});

test("本文の同時読み取りは 10 を超えない", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  const traffic = await countRequests(page);
  await page.goto("./");
  await openInbox(page);

  expect(traffic.peakBlobReads).toBeGreaterThan(0);
  expect(traffic.peakBlobReads).toBeLessThanOrEqual(10);
});

test("タスクを開いたとき、そのファイルは 1 回だけ読む", async ({ page }) => {
  await configure(page);
  await mockGitHub(page, files());
  const traffic = await countRequests(page);
  await page.goto("./");
  await openInbox(page);
  traffic.paths.length = 0;

  await page.getByRole("button", { name: /人のタスク 3$/ }).click();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: "手を動かす" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(traffic.paths.filter((path) => path.endsWith(`/contents/tasks/${taskId(3)}.md`))).toHaveLength(1);
});
