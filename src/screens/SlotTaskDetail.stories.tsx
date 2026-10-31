import type { Meta, StoryObj } from "@storybook/react-vite";
import { defaultSettings } from "../settings";
import { mockGitHub } from "../stories/mockGitHub";
import { SlotTaskDetail } from "./SlotTaskDetail";

const path = "tasks/20261029-abcd.md";

const task = `---
title: 請求書を送る
---

## あなたがやること
- [x] PDF を出す
- [ ] メールで送る
`;

const meta = {
  title: "screens/SlotTaskDetail",
  component: SlotTaskDetail,
  args: {
    state: { status: "loading", slot: "19:00–19:15" },
    settings: { ...defaultSettings, token: "story-token" },
    onRetry: () => {},
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof SlotTaskDetail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Checklist: Story = {
  args: { state: { status: "checklist", slot: "19:00–19:15", taskId: "20261029-abcd", path } },
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: task } }),
};

export const FailureRetry: Story = {
  args: {
    state: {
      status: "error",
      slot: "19:00–19:15",
      taskId: "20261029-abcd",
      failure: { reason: "GitHub に接続できません。", hint: "もう一度試してください。", action: "retry" },
    },
  },
};

export const FailureSettings: Story = {
  args: {
    state: {
      status: "error",
      slot: "19:00–19:15",
      taskId: "20261029-abcd",
      failure: { reason: "トークンが無効です。", hint: "設定を見直してください。", action: "settings" },
    },
  },
};
