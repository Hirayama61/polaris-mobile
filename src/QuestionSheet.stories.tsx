import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuestionSheet } from "./QuestionSheet";
import { defaultSettings } from "./settings";
import { mockGitHub } from "./stories/mockGitHub";

const path = "tasks/20261030-q1.md";

const question = (answer: string): string => `---
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
- C: 右端

## 回答
${answer}
`;

const meta = {
  title: "QuestionSheet",
  component: QuestionSheet,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    isOnline: true,
    initialQuestion: { id: "20261030-q1", title: "受信箱のタブはどこに置く", answered: false },
    onClose: () => {},
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof QuestionSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unanswered: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: question("(未回答)") } }),
};

export const Answered: Story = {
  args: { initialQuestion: { id: "20261030-q1", title: "受信箱のタブはどこに置く", answered: true } },
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: question("B") } }),
};

export const Missing: Story = {
  beforeEach: () => mockGitHub({}),
};

export const Failed: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 500 } }),
};

export const FromInbox: Story = {
  args: { backTo: { label: "受信箱に戻る", onBack: () => {} } },
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: question("(未回答)") } }),
};

const linkedQuestion = `---
id: 20261030-q1
title: "質問: どの PR を先に見る"
issue: Hirayama61/shogi-atlas-app#68
assignee: human
status: todo
---

## 質問
Hirayama61/shogi-atlas-app#70 と https://github.com/Hirayama61/polaris-mobile/pull/91 のどちらを先に見ますか。

## 回答
(未回答)
`;

export const WithLinks: Story = {
  beforeEach: () => mockGitHub({ [path]: { status: 200, content: linkedQuestion } }),
};
