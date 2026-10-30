import type { Meta, StoryObj } from "@storybook/react-vite";
import { SegmentView } from "./ProjectsSheet";

const meta = {
  title: "SegmentView",
  component: SegmentView,
  decorators: [
    (Story) => (
      <p className="project-body">
        <Story />
      </p>
    ),
  ],
  args: { segment: { kind: "text", text: "画面を 3 つに保つ" } },
} satisfies Meta<typeof SegmentView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Text: Story = {};

export const Link: Story = {
  args: {
    segment: { kind: "link", text: "#46", href: "https://github.com/Hirayama61/polaris-mobile/issues/46" },
  },
};
