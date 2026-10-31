import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssueLink } from "./IssueLink";

const meta = {
  title: "IssueLink",
  component: IssueLink,
  args: {
    href: "https://github.com/Hirayama61/shogi-atlas-app/issues/68",
    label: "Hirayama61/shogi-atlas-app#68",
  },
} satisfies Meta<typeof IssueLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
