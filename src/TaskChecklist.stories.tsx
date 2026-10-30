import type { Meta, StoryObj } from "@storybook/react-vite";
import { defaultSettings } from "./settings";
import { mockGitHub } from "./stories/mockGitHub";
import { TaskChecklist } from "./TaskChecklist";

const path = "tasks/20261025-oubf.md";

const task = `---
id: 20261025-oubf
---

## あなたがやること
- [x] Google アカウントの作成ページを開く
- [ ] 電話番号で確認する
- [ ] 復旧用のメールアドレスを登録する
`;

const meta = {
  title: "TaskChecklist",
  component: TaskChecklist,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    taskId: "20261025-oubf",
    path,
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof TaskChecklist>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: task } }),
};

export const Empty: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: "## あなたがやること\n" } }),
};

export const Missing: Story = {
  beforeEach: () => mockGitHub({}),
};

export const Loading: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: "pending" } }),
};

export const Unauthorized: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 401 } }),
};
