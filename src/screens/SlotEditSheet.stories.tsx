import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { extractSchedule } from "../daily";
import { defaultSettings } from "../settings";
import type { useDaily } from "../useDaily";
import { AddSlotSheet, ChangeSlotSheet } from "./SlotEditSheet";

const content = `---
date: 2026-10-31
---

## 今日の時間割
| 時刻 | やること | 誰 | 実績 |
| --- | --- | --- | --- |
| 07:00–07:30 | 散歩 | あなた | |
| 09:00–18:00 | 仕事 | | 10:00 から |
`;

const daily: ReturnType<typeof useDaily> = {
  state: { status: "ready", content, sha: "sha-before", freshness: { kind: "fresh" } },
  reload: () => {},
  replace: () => {},
};

const [, work] = extractSchedule(content);

const meta = {
  title: "SlotEditSheet",
  component: ChangeSlotSheet,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    date: "2026-10-31",
    isOnline: true,
    daily,
    target: { row: work ?? { line: 0, time: "", what: "", who: "", actual: undefined }, content },
    onClose: () => {},
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof ChangeSlotSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Change: Story = {};

export const Add: Story = {
  render: (args) => <AddSlotSheet {...args} />,
};

export const InvalidTime: Story = {
  render: (args) => <AddSlotSheet {...args} />,
  play: async ({ canvasElement }) => {
    const sheet = within(canvasElement);
    await userEvent.type(await sheet.findByRole("textbox", { name: "やること" }), "朝食");
    await userEvent.click(await sheet.findByRole("button", { name: "足す" }));
  },
};

export const Offline: Story = {
  args: { isOnline: false },
  play: async ({ canvasElement }) => {
    const sheet = within(canvasElement);
    await userEvent.click(await sheet.findByRole("button", { name: "保存" }));
  },
};
