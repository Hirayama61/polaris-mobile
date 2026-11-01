import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectItemsSection } from "./ProjectItemsSection";

const meta = {
  title: "ProjectItemsSection",
  component: ProjectItemsSection,
  args: {
    items: [
      {
        kind: "question",
        id: "20261030-q1",
        title: "受信箱のタブはどこに置く",
        answered: false,
        projectSlug: "polaris",
        projectName: "Polaris",
        created: undefined,
      },
      {
        kind: "question",
        id: "20261029-q2",
        title: "ブログの公開は週何本",
        answered: true,
        projectSlug: "polaris",
        projectName: "Polaris",
        created: undefined,
      },
      {
        kind: "task",
        id: "20261029-t1",
        title: "Google アカウントを作る",
        projectSlug: "polaris",
        projectName: "Polaris",
        created: undefined,
      },
    ],
  },
} satisfies Meta<typeof ProjectItemsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Items: Story = {};

export const Empty: Story = {
  args: { items: [] },
};

export const NotLoaded: Story = {
  args: { items: undefined },
};

export const LongTitles: Story = {
  args: {
    items: [
      {
        kind: "question",
        id: "20261031-q3",
        title: "プロジェクトのシートで、タイトルが長いときに回答済みの印が改行されずに右端へ並ぶかを確かめる",
        answered: true,
        projectSlug: "polaris",
        projectName: "Polaris",
        created: undefined,
      },
      {
        kind: "task",
        id: "20261031-t4",
        title: "長いタイトルのタスクでも、先頭の印とタイトルの位置が質問の行と揃っていることを見る",
        projectSlug: "polaris",
        projectName: "Polaris",
        created: undefined,
      },
      ...meta.args.items,
    ],
  },
};
