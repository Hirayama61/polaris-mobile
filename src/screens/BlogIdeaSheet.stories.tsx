import type { Meta, StoryObj } from "@storybook/react-vite";
import { removeDraft, saveDraft } from "../drafts";
import { defaultSettings } from "../settings";
import { BlogIdeaSheet } from "./BlogIdeaSheet";
import { BLOG_IDEA_DRAFT_KEY } from "./useBlogIdea";

const meta = {
  title: "screens/BlogIdeaSheet",
  component: BlogIdeaSheet,
  args: {
    settings: { ...defaultSettings, token: "story-token" },
    isOnline: true,
    onClose: () => {},
    onSent: () => {},
    onOpenSettings: () => {},
  },
  beforeEach: () => {
    removeDraft(BLOG_IDEA_DRAFT_KEY);
  },
} satisfies Meta<typeof BlogIdeaSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Written: Story = {
  beforeEach: () => {
    saveDraft(BLOG_IDEA_DRAFT_KEY, "# 朝の散歩を続けるコツ\n\n- 始めたきっかけ\n- 続いた理由");
    return () => removeDraft(BLOG_IDEA_DRAFT_KEY);
  },
};

export const NoToken: Story = {
  args: { settings: defaultSettings },
};
