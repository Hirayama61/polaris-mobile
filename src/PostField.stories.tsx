import type { Meta, StoryObj } from "@storybook/react-vite";
import { postDraftKey, removeDraft, saveDraft } from "./drafts";
import { PostField } from "./PostField";
import { defaultSettings } from "./settings";
import { mockGitHub } from "./stories/mockGitHub";

const date = "2026-10-31";

const meta = {
  title: "PostField",
  component: PostField,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    date,
    isOnline: true,
    onOpenSettings: () => {},
    onSent: () => {},
  },
  beforeEach: () => mockGitHub({}),
} satisfies Meta<typeof PostField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithDraft: Story = {
  beforeEach: () => {
    saveDraft(postDraftKey(date), "夕日がきれい");
    return () => removeDraft(postDraftKey(date));
  },
};
