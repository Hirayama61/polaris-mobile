import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { defaultSettings } from "../settings";
import type { useDaily } from "../useDaily";
import { TodayScreen } from "./Today";

// 時刻を「朝」「昼」にして、「いま」の印と完了の折り畳みが撮る時刻で変わらないようにする。
const content = `---
date: 2026-10-31
wake_at:
review_at:
---

## 今日の時間割
| 時刻 | やること | 誰 | 実績 |
| --- | --- | --- | --- |
| 朝 | 散歩 | あなた | |
| 昼 | 仕事 | | |

## あなたの番 (3 つまで)
- [ ] 小説の構想を音声で入れる
- [ ] 本を返す

## 振り返り (夜に書く)
`;

const daily: ReturnType<typeof useDaily> = {
  state: { status: "ready", content, sha: "sha-before", freshness: { kind: "fresh" } },
  reload: () => {},
  replace: () => {},
};

const meta = {
  title: "screens/Today",
  component: TodayScreen,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    date: "2026-10-31",
    daily,
    isOnline: true,
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof TodayScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActualFailed: Story = {
  args: { isOnline: false },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    const actual = await screen.findByRole("textbox", { name: "朝 の実績" });
    await userEvent.type(actual, "30 分歩いた{Enter}");
    await screen.findByRole("alert");
  },
};

export const TurnFailed: Story = {
  args: { isOnline: false },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await userEvent.click(await screen.findByRole("checkbox", { name: "本を返す" }));
    await screen.findByRole("alert");
  },
};
