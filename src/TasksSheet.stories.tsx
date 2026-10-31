import type { Meta, StoryObj } from "@storybook/react-vite";
import { defaultSettings } from "./settings";
import { mockGitHub } from "./stories/mockGitHub";
import { TasksSheet } from "./TasksSheet";

const path = "tasks/20261029-t1.md";

const task = `---
id: 20261029-t1
title: Google アカウントを作る
assignee: human
status: todo
---

## あなたがやること
- [x] Google アカウントの作成ページを開く
- [ ] 電話番号で確認する

## 疑問点
- 復旧用のメールアドレスは要るか

## 調べたこと
復旧用のメールアドレスは任意。後から足せる。
`;

const meta = {
  title: "TasksSheet",
  component: TasksSheet,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    initialTask: { id: "20261029-t1", title: "Google アカウントを作る", projectName: "Polaris" },
    onClose: () => {},
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof TasksSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Detail: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: task } }),
};

export const FromInbox: Story = {
  args: { closeLabel: "受信箱に戻る" },
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: task } }),
};

export const Missing: Story = {
  beforeEach: () => mockGitHub({}),
};

export const Failed: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 500 } }),
};
