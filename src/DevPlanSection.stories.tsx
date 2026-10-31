import type { Meta, StoryObj } from "@storybook/react-vite";
import { DevPlanSection } from "./DevPlanSection";

const meta = {
  title: "DevPlanSection",
  component: DevPlanSection,
  args: { plan: { status: "loading" } },
} satisfies Meta<typeof DevPlanSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Ready: Story = {
  args: {
    plan: {
      status: "ready",
      repos: [
        {
          kind: "ready",
          repo: "Hirayama61/polaris-mobile",
          entries: [
            {
              kind: "pr",
              issue: { number: 60, title: "今日の開発の予定と実績を見られるようにする", closedAt: undefined },
            },
            {
              kind: "slot",
              hour: 10,
              issue: { number: 61, title: "プロジェクトのシートを見る場所にする", closedAt: undefined },
            },
            {
              kind: "later",
              issue: { number: 64, title: "「今日」を時間割だけにする", closedAt: undefined },
            },
          ],
          closed: [{ number: 58, title: "夜の振り返りを残す", closedAt: "2026-10-31T01:00:00Z" }],
        },
        {
          kind: "error",
          repo: "Hirayama61/other",
          failure: {
            reason: "リポジトリが見つかりません。",
            hint: "設定のリポジトリ名と、トークンの対象リポジトリを確かめてください。",
            action: "settings",
          },
        },
      ],
    },
  },
};

export const Empty: Story = {
  args: {
    plan: {
      status: "ready",
      repos: [{ kind: "ready", repo: "Hirayama61/polaris-mobile", entries: [], closed: [] }],
    },
  },
};

export const NoRepos: Story = {
  args: { plan: { status: "ready", repos: [] } },
};
