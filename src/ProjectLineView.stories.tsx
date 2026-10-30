import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectLineView } from "./ProjectsSheet";

const meta = {
  title: "ProjectLineView",
  component: ProjectLineView,
  decorators: [
    (Story) => (
      <div className="project-body">
        <Story />
      </div>
    ),
  ],
  args: { line: { kind: "blank" } },
} satisfies Meta<typeof ProjectLineView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Heading: Story = {
  args: { line: { kind: "heading", level: 2, segments: [{ kind: "text", text: "目的" }] } },
};

export const Subheading: Story = {
  args: { line: { kind: "heading", level: 3, segments: [{ kind: "text", text: "やること" }] } },
};

export const Item: Story = {
  args: {
    line: {
      kind: "item",
      segments: [
        { kind: "text", text: "画面を 3 つに保つ " },
        { kind: "link", text: "#46", href: "https://github.com/Hirayama61/polaris-mobile/issues/46" },
      ],
    },
  },
};

export const Text: Story = {
  args: { line: { kind: "text", segments: [{ kind: "text", text: "スマホで朝と夜に 1 回ずつ開く。" }] } },
};

export const Blank: Story = {};
