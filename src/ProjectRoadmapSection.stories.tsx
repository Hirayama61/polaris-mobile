import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectRoadmapSection } from "./ProjectRoadmapSection";

const counts = [0, 1, 0, 0, 3, 2, 0, 0, 1, 4, 0, 2, 1, 0];
const merged = counts.map((count, index) => ({
  date: `2026-10-${String(18 + index).padStart(2, "0")}`,
  count,
}));

const meta = {
  title: "ProjectRoadmapSection",
  component: ProjectRoadmapSection,
  args: { roadmap: { status: "loading" } },
} satisfies Meta<typeof ProjectRoadmapSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Ready: Story = {
  args: {
    roadmap: {
      status: "ready",
      roadmap: {
        kind: "ready",
        repo: "Hirayama61/polaris-mobile",
        open: [
          { number: 61, title: "プロジェクトのシートを見る場所にする", labels: ["ready"] },
          { number: 64, title: "「今日」を時間割だけにする", labels: ["needs-info", "hold"] },
          { number: 66, title: "夜の振り返りの上に今日やったことを並べる", labels: [] },
        ],
        closed: [{ number: 58, title: "夜の振り返りを残す", closedAt: "2026-10-31T01:00:00Z" }],
        merged,
      },
    },
  },
};

export const Empty: Story = {
  args: {
    roadmap: {
      status: "ready",
      roadmap: {
        kind: "ready",
        repo: "Hirayama61/polaris-mobile",
        open: [],
        closed: [],
        merged: merged.map((day) => ({ ...day, count: 0 })),
      },
    },
  },
};

export const Failed: Story = {
  args: {
    roadmap: {
      status: "ready",
      roadmap: {
        kind: "error",
        repo: "Hirayama61/other",
        failure: {
          reason: "リポジトリが見つかりません。",
          hint: "設定のリポジトリ名と、トークンの対象リポジトリを確かめてください。",
          action: "settings",
        },
      },
    },
  },
};
