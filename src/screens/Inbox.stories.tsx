import type { Meta, StoryObj } from "@storybook/react-vite";
import type { InboxItem } from "../inbox";
import { InboxScreen } from "./Inbox";

const items: InboxItem[] = [
  {
    kind: "question",
    id: "20261030-q1",
    title: "受信箱のタブはどこに置く",
    answered: false,
    projectSlug: "polaris",
    projectName: "Polaris",
    created: "2026-10-30T10:00:00+09:00",
  },
  {
    kind: "question",
    id: "20261029-q2",
    title: "ブログの公開は週何本",
    answered: true,
    projectSlug: "polaris",
    projectName: "Polaris",
    created: "2026-10-29T10:00:00+09:00",
  },
  {
    kind: "task",
    id: "20261029-t1",
    title: "Google アカウントを作る",
    projectSlug: "polaris",
    projectName: "Polaris",
    created: "2026-10-29T08:00:00+09:00",
  },
  {
    kind: "task",
    id: "20261030-t3",
    title: "下書きを 1 本読む",
    projectSlug: "blog",
    projectName: "ブログ",
    created: "2026-10-30T12:00:00+09:00",
  },
  {
    kind: "task",
    id: "20261028-t2",
    title: "散歩のルートを決める",
    projectSlug: undefined,
    projectName: undefined,
    created: "2026-10-28T08:00:00+09:00",
  },
];

const meta = {
  title: "screens/Inbox",
  component: InboxScreen,
  args: {
    state: { status: "ready", items },
    seenAt: "2026-10-30T09:00:00+09:00",
    onOpenItem: () => {},
    onOpenProjects: () => {},
    onRetry: () => {},
    onOpenSettings: () => {},
  },
} satisfies Meta<typeof InboxScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Items: Story = {};

export const Empty: Story = {
  args: { state: { status: "ready", items: [] } },
};

export const Failed: Story = {
  args: {
    state: {
      status: "error",
      failure: { reason: "GitHub に届きませんでした。", hint: "通信を確かめてください。", action: "retry" },
    },
  },
};
