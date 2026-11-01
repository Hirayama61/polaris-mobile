import type { CSSProperties } from "react";
import {
  getProjectColor,
  groupInboxByProject,
  type InboxGroup,
  type InboxItem,
  isNewSince,
  NO_PROJECT_LABEL,
} from "../inbox";
import { KindMark } from "../KindMark";
import { StateCard } from "../ui";
import type { InboxLoadState } from "../useInbox";
import { FailureAction, UnconfiguredCard } from "./common";

type BodyProps = {
  state: InboxLoadState;
  seenAt: string | undefined;
  onOpenItem: (item: InboxItem) => void;
  onRetry: () => void;
  onOpenSettings: () => void;
};

type Props = BodyProps & {
  onOpenProjects: () => void;
};

type RowProps = {
  title: string;
  kind: InboxItem["kind"];
  projectLabel: string;
  projectColor: string;
  isAnswered: boolean;
  isNew: boolean;
  onSelect: () => void;
};

const InboxRow = (props: RowProps) => {
  const { title, kind, projectLabel, projectColor, isAnswered, isNew, onSelect } = props;
  const projectMarkLabel = `プロジェクト: ${projectLabel}`;
  // 色は CSS 変数だけで渡し、塗りは class 側で読む。
  const projectColorStyle = { "--project-color": projectColor } as CSSProperties;
  return (
    <button type="button" className="project-row inbox-row" onClick={onSelect}>
      <span
        className="inbox-project-mark"
        role="img"
        aria-label={projectMarkLabel}
        style={projectColorStyle}
      />
      <KindMark kind={kind} />
      <span className="blog-row-title">{title}</span>
      {isNew && <span className="inbox-new" role="img" aria-label="新着" />}
      {isAnswered && <span className="tag question-answered">回答済み</span>}
      <span className="project-chevron" aria-hidden="true" />
    </button>
  );
};

type GroupProps = {
  group: InboxGroup;
  seenAt: string | undefined;
  onOpenItem: (item: InboxItem) => void;
};

const InboxGroupSection = (props: GroupProps) => {
  const { group, seenAt, onOpenItem } = props;
  const heading = group.projectName ?? NO_PROJECT_LABEL;
  return (
    <section className="section" aria-label={heading}>
      <div className="section-head">
        <h2 className="section-title">{heading}</h2>
        <span className="section-meta">{group.items.length} 件</span>
      </div>
      <ul className="panel project-list">
        {group.items.map((item) => {
          const isAnswered = item.kind === "question" && item.answered;
          return (
            <li key={item.id}>
              <InboxRow
                title={item.title}
                kind={item.kind}
                projectLabel={heading}
                projectColor={getProjectColor(item.projectSlug)}
                isAnswered={isAnswered}
                isNew={isNewSince(item.created, seenAt)}
                onSelect={() => onOpenItem(item)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const InboxBody = (props: BodyProps) => {
  const { state, seenAt, onOpenItem, onRetry, onOpenSettings } = props;
  if (state.status === "unconfigured") {
    return <UnconfiguredCard onOpenSettings={onOpenSettings} />;
  }
  if (state.status === "loading") {
    return (
      <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-short" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <StateCard
        title="受信箱を読めませんでした"
        tone="error"
        action={<FailureAction failure={state.failure} onRetry={onRetry} onOpenSettings={onOpenSettings} />}
      >
        <p>{state.failure.reason}</p>
        <p>{state.failure.hint}</p>
      </StateCard>
    );
  }
  const isEmpty = state.items.length === 0;
  if (isEmpty) {
    return <p className="panel panel-empty muted">いま受信箱は空です。</p>;
  }
  const groups = groupInboxByProject(state.items);
  return (
    <>
      {groups.map((group) => (
        <InboxGroupSection
          key={group.projectName ?? NO_PROJECT_LABEL}
          group={group}
          seenAt={seenAt}
          onOpenItem={onOpenItem}
        />
      ))}
    </>
  );
};

/**
 * 先頭にプロジェクトのシートの入口を置き、`tasks/` の todo のタスクと質問を project ごとに並べる。
 * タップで回答かタスクのシートを開く。
 *
 * @remarks 読み込みと「前に開いた時刻」は App が持つ。タブの「!」と同じ一覧を使うため。
 */
export const InboxScreen = (props: Props) => {
  const { onOpenProjects, ...bodyProps } = props;
  return (
    <>
      <button type="button" className="button button-block inbox-projects" onClick={onOpenProjects}>
        プロジェクトを見る
      </button>
      <InboxBody {...bodyProps} />
    </>
  );
};
