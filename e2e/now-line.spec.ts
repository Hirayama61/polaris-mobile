import { expect, type Page, test } from "@playwright/test";
import { configure, mockGitHub } from "./github";

// today.spec.ts は時計を止めるので、時刻を進める確認はこのファイルに分ける。
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

## 振り返り (夜に書く)
`;

const openToday = async (page: Page, time: string) => {
  await page.clock.install({ time: new Date(`${date}T${time}:00+09:00`) });
  await configure(page);
  const puts = await mockGitHub(page, new Map([[`daily/${date}.md`, daily]]));
  await page.goto("./");
  return puts;
};

const slotOf = (page: Page, time: string) =>
  page.getByRole("region", { name: "時間割" }).getByRole("listitem").filter({ hasText: time });

test("今の時刻を含むコマに現在時刻の線を出し、「いま」で見分けられる", async ({ page }) => {
  const puts = await openToday(page, "12:00");
  const work = slotOf(page, "09:00–18:00");
  await expect(work.getByRole("img", { name: "現在時刻" })).toBeVisible();
  await expect(work.getByText("いま")).toBeVisible();
  await expect(work).toHaveAttribute("aria-current", "time");
  await expect(slotOf(page, "07:00–07:30").getByRole("img", { name: "現在時刻" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "現在時刻" })).toHaveCount(1);
  expect(puts).toEqual([]);
});

test("開き直さなくても、1 分たつと線の位置と「いま」のコマが進む", async ({ page }) => {
  const puts = await openToday(page, "07:29");
  const walk = slotOf(page, "07:00–07:30");
  const work = slotOf(page, "09:00–18:00");
  await expect(walk.getByRole("img", { name: "現在時刻" })).toBeVisible();
  await expect(walk.getByText("いま")).toBeVisible();
  await page.clock.runFor(60 * 1000);
  await expect(walk.getByRole("img", { name: "現在時刻" })).toHaveCount(0);
  await expect(walk.getByText("いま")).toHaveCount(0);
  // 07:30 はコマの間なので、次の仕事のコマの上端に線を引く。
  await expect(work.getByRole("img", { name: "現在時刻" })).toBeVisible();
  expect(puts).toEqual([]);
});

test("最初のコマより前は線を出さない", async ({ page }) => {
  await openToday(page, "06:30");
  await expect(slotOf(page, "07:00–07:30")).toBeVisible();
  await expect(page.getByRole("img", { name: "現在時刻" })).toHaveCount(0);
});
