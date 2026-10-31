import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import type { InboxItem } from "./inbox";
import { ProjectsSheet } from "./ProjectsSheet";
import { defaultSettings } from "./settings";
import { mockGitHub } from "./stories/mockGitHub";

const polaris = `---
name: Polaris
kind: code
status: active
github: Hirayama61/polaris-mobile
---

## 目的
朝に開いて 3 秒で今日やることが分かる。
`;

const walk = `---
name: 散歩
kind: life
status: active
---

## 目的
朝の散歩を続ける。
`;

const inboxItems: InboxItem[] = [
  {
    kind: "question",
    id: "20261030-q1",
    title: "受信箱のタブはどこに置く",
    answered: false,
    projectSlug: "polaris",
    projectName: "Polaris",
    created: "2026-10-30T10:00:00+09:00",
  },
  {
    kind: "task",
    id: "20261028-t2",
    title: "散歩のルートを決める",
    projectSlug: "walk",
    projectName: "散歩",
    created: "2026-10-28T08:00:00+09:00",
  },
];

// 他のリポジトリの Issue と PR は登録しないので 404 になり、進み具合は「読めない」で止まる。日付で画像が変わらない。
const mockProjects = () =>
  mockGitHub({
    projects: { status: 200, names: ["polaris.md", "walk.md"] },
    "projects/polaris.md": { status: 200, content: polaris },
    "projects/walk.md": { status: 200, content: walk },
  });

const meta = {
  title: "ProjectsSheet",
  component: ProjectsSheet,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    inboxItems,
    onClose: () => {},
    onOpenSettings: () => {},
  },
  beforeEach: mockProjects,
} satisfies Meta<typeof ProjectsSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const List: Story = {};

export const LinkedDetail: Story = {
  play: async ({ canvasElement }) => {
    const sheet = within(canvasElement);
    await userEvent.click(await sheet.findByRole("button", { name: "Polaris" }));
  },
};

export const UnlinkedDetail: Story = {
  play: async ({ canvasElement }) => {
    const sheet = within(canvasElement);
    await userEvent.click(await sheet.findByRole("button", { name: "散歩" }));
  },
};
