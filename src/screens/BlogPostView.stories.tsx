import type { Meta, StoryObj } from "@storybook/react-vite";
import { defaultSettings } from "../settings";
import { BlogPostView } from "./BlogPostView";

const outline = `---
created: 2026-10-29
---

# 朝の散歩を続けるコツ

## 構成

- 始めたきっかけ
- 続いた理由

## 一言

体験談を厚めに。
`;

const draft = `---
status: draft
---

# 朝の散歩を続けるコツ

散歩を始めて 1 年になる。

## 一言
`;

const meta = {
  title: "screens/BlogPostView",
  component: BlogPostView,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    isOnline: true,
    post: { id: "walk", title: "朝の散歩を続けるコツ", stage: "needsDraft", files: { outline } },
    onBack: () => {},
    onSaved: () => {},
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof BlogPostView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Outline: Story = {};

export const Draft: Story = {
  args: { post: { id: "walk", title: "朝の散歩を続けるコツ", stage: "drafting", files: { outline, draft } } },
};

export const Published: Story = {
  args: {
    post: {
      id: "walk",
      title: "朝の散歩を続けるコツ",
      stage: "published",
      files: { draft: draft.replace("status: draft", "status: done") },
    },
  },
};
