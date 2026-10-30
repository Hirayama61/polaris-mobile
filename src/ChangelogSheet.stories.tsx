import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChangelogSheet } from "./ChangelogSheet";

// 実際の履歴はビルド時の git log で変わるので、VRT が揺れないよう固定の履歴を渡す。
const meta = {
  title: "ChangelogSheet",
  component: ChangelogSheet,
  args: {
    entries: [
      {
        hash: "3e3dd68",
        date: "2026-10-30",
        subject: "feat: 「設定」からアプリ本体の更新履歴を読めるようにする (#35)",
      },
      {
        hash: "37fa77e",
        date: "2026-10-29",
        subject: "feat: タスクに疑問点を書き、調べたことを読めるようにする (#32)",
      },
    ],
    onClose: () => {},
  },
} satisfies Meta<typeof ChangelogSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Entries: Story = {};

export const Empty: Story = { args: { entries: [] } };
