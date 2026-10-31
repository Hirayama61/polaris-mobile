import type { Meta, StoryObj } from "@storybook/react-vite";
import { toBlogPath } from "../blog";
import { defaultSettings } from "../settings";
import { mockGitHub } from "../stories/mockGitHub";
import { BlogScreen } from "./Blog";

const outline = `---
created: 2026-10-29
---

# 朝の散歩を続けるコツ

## 構成

- 始めたきっかけ
- 続いた理由

## 一言
`;

const draft = `---
status: draft
---

# PWA を GitHub だけで動かす

本文。
`;

const meta = {
  title: "screens/Blog",
  component: BlogScreen,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    isOnline: true,
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof BlogScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Posts: Story = {
  beforeEach: () =>
    mockGitHub({
      "writing/blog/ideas": { status: 200, names: ["walk.md", "tea.md"] },
      "writing/blog/outline": { status: 200, names: ["walk.md"] },
      "writing/blog/draft": { status: 200, names: ["pwa.md"] },
      "writing/blog/published": { status: 200, names: [] },
      [toBlogPath("ideas", "walk")]: { status: 200, content: "---\nstatus: new\n---\n" },
      [toBlogPath("ideas", "tea")]: { status: 200, content: "---\ntitle: お茶の淹れ方\n---\n" },
      [toBlogPath("outline", "walk")]: { status: 200, content: outline },
      [toBlogPath("draft", "pwa")]: { status: 200, content: draft },
    }),
};

export const Empty: Story = {
  beforeEach: () => mockGitHub({}),
};

export const Failed: Story = {
  beforeEach: () => mockGitHub({ "writing/blog/ideas": { status: 500 } }),
};
