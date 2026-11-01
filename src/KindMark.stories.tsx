import type { Meta, StoryObj } from "@storybook/react-vite";
import { KindMark } from "./KindMark";

const meta = {
  title: "KindMark",
  component: KindMark,
  args: { kind: "task" },
} satisfies Meta<typeof KindMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Task: Story = {};

export const Question: Story = {
  args: { kind: "question" },
};
