import { getRepoFailureHint } from "./devPlan";
import type { RepoIssue, RepoOpenIssue } from "./repoEntries";
import { type DayCount, formatShortDate, getBarHeight, type ProjectRoadmap, ROADMAP_DAYS } from "./roadmap";
import type { ProjectRoadmapState } from "./useProjectRoadmap";

/** 1 日分の棒の枠の幅 (SVG の単位)。棒と隙間を含む。 */
const DAY_WIDTH = 20;
/** 棒の幅。枠との差が隙間になる。 */
const BAR_WIDTH = 14;
/** 棒の最大の高さ。 */
const BAR_MAX_HEIGHT = 56;
/** 棒の上に件数を書く余白。 */
const LABEL_SPACE = 14;
/** 0 件の日に出す線の太さ。日が並んでいることを見せる。 */
const EMPTY_BAR_HEIGHT = 2;
const CHART_WIDTH = DAY_WIDTH * ROADMAP_DAYS;
const CHART_HEIGHT = BAR_MAX_HEIGHT + LABEL_SPACE;

const toIssueLine = (issue: { number: number; title: string }): string => `#${issue.number} ${issue.title}`;

const OpenIssueRow = (props: { issue: RepoOpenIssue }) => {
  const { issue } = props;
  const issueLine = toIssueLine(issue);
  return (
    <li className="dev-row roadmap-row">
      <span className="dev-issue">{issueLine}</span>
      {issue.labels.map((label) => (
        <span key={label} className="tag roadmap-label">
          {label}
        </span>
      ))}
    </li>
  );
};

const ClosedIssueRow = (props: { issue: RepoIssue }) => {
  const { issue } = props;
  const issueLine = toIssueLine(issue);
  return (
    <li className="dev-row">
      <span className="dev-issue">{issueLine}</span>
    </li>
  );
};

const MergedBar = (props: { day: DayCount; index: number; max: number }) => {
  const { day, index, max } = props;
  const x = index * DAY_WIDTH + (DAY_WIDTH - BAR_WIDTH) / 2;
  const hasMerged = day.count > 0;
  if (!hasMerged) {
    return (
      <rect
        className="roadmap-bar-empty"
        x={x}
        y={CHART_HEIGHT - EMPTY_BAR_HEIGHT}
        width={BAR_WIDTH}
        height={EMPTY_BAR_HEIGHT}
      />
    );
  }
  const height = getBarHeight(day.count, max, BAR_MAX_HEIGHT);
  const y = CHART_HEIGHT - height;
  return (
    <g>
      <rect className="roadmap-bar" x={x} y={y} width={BAR_WIDTH} height={height} rx={2} />
      <text className="roadmap-bar-count" x={x + BAR_WIDTH / 2} y={y - 3} textAnchor="middle">
        {day.count}
      </text>
    </g>
  );
};

const MergedChart = (props: { merged: DayCount[] }) => {
  const { merged } = props;
  const max = Math.max(0, ...merged.map((day) => day.count));
  const total = merged.reduce((sum, day) => sum + day.count, 0);
  const chartLabel = `直近 ${ROADMAP_DAYS} 日にマージされた PR は ${total} 件`;
  const firstDate = formatShortDate(merged[0]?.date ?? "");
  const lastDate = formatShortDate(merged[merged.length - 1]?.date ?? "");
  return (
    <div className="roadmap-chart">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={chartLabel}>
        {merged.map((day, index) => (
          <MergedBar key={day.date} day={day} index={index} max={max} />
        ))}
      </svg>
      <div className="roadmap-axis" aria-hidden="true">
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
};

const RoadmapBody = (props: { roadmap: ProjectRoadmap }) => {
  const { roadmap } = props;
  const isError = roadmap.kind === "error";
  if (isError) {
    const failureHint = getRepoFailureHint(roadmap.failure, roadmap.repo);
    return (
      <div className="panel dev-repo">
        <p className="project-group">{roadmap.repo}</p>
        <div className="dev-error" role="alert">
          <p>読めませんでした。{roadmap.failure.reason}</p>
          <p className="muted">{failureHint}</p>
        </div>
      </div>
    );
  }
  const hasOpen = roadmap.open.length > 0;
  const hasClosed = roadmap.closed.length > 0;
  return (
    <div className="panel dev-repo">
      <p className="project-group">{roadmap.repo}</p>
      <p className="dev-subhead roadmap-first-subhead">これから</p>
      {hasOpen ? (
        <ul className="dev-list">
          {roadmap.open.map((issue) => (
            <OpenIssueRow key={issue.number} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className="dev-empty muted">open の Issue はありません。</p>
      )}
      <p className="dev-subhead">済んだこと (直近 {ROADMAP_DAYS} 日)</p>
      {hasClosed ? (
        <ul className="dev-list">
          {roadmap.closed.map((issue) => (
            <ClosedIssueRow key={issue.number} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className="dev-empty muted">閉じた Issue はありません。</p>
      )}
      <p className="dev-subhead">マージされた PR (日ごと)</p>
      <MergedChart merged={roadmap.merged} />
    </div>
  );
};

/**
 * 連携プロジェクトの「これから」「済んだこと」と、日ごとのマージされた PR の数の棒グラフ。
 *
 * @remarks 取得は持たない。`useProjectRoadmap` の結果を受け取って描画するだけ。連携していなければ何も出さない。
 */
export const ProjectRoadmapSection = (props: { roadmap: ProjectRoadmapState }) => {
  const { roadmap } = props;
  const isIdle = roadmap.status === "idle";
  if (isIdle) {
    return null;
  }
  const isLoading = roadmap.status === "loading";
  return (
    <section className="section" aria-labelledby="roadmap-title">
      <div className="section-head">
        <h3 id="roadmap-title" className="section-title">
          進み具合
        </h3>
      </div>
      {isLoading ? (
        <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
          <div className="skeleton-line" />
          <div className="skeleton-line skeleton-short" />
        </div>
      ) : (
        <RoadmapBody roadmap={roadmap.roadmap} />
      )}
    </section>
  );
};
