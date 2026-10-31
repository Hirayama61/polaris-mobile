import { type DevPlanEntry, type DevRepoPlan, getEntryLabel, getRepoFailureHint } from "./devPlan";
import type { RepoIssue } from "./github";
import type { DevPlanState } from "./useDevPlan";

const toIssueLine = (issue: RepoIssue): string => `#${issue.number} ${issue.title}`;

const EntryRow = (props: { entry: DevPlanEntry }) => {
  const { entry } = props;
  const label = getEntryLabel(entry);
  const issueLine = toIssueLine(entry.issue);
  const isSlot = entry.kind === "slot";
  if (isSlot) {
    return (
      <li className="dev-row">
        <span className="dev-when">{label}</span>
        <span className="dev-issue">{issueLine}</span>
      </li>
    );
  }
  return (
    <li className="dev-row">
      <span className="dev-when dev-when-muted">{label}</span>
      <span className="dev-issue">{issueLine}</span>
    </li>
  );
};

const ClosedRow = (props: { issue: RepoIssue }) => {
  const { issue } = props;
  const issueLine = toIssueLine(issue);
  return (
    <li className="dev-row">
      <span className="dev-issue">{issueLine}</span>
    </li>
  );
};

const RepoPlan = (props: { plan: DevRepoPlan }) => {
  const { plan } = props;
  const isError = plan.kind === "error";
  if (isError) {
    const failureHint = getRepoFailureHint(plan.failure, plan.repo);
    return (
      <div className="panel dev-repo">
        <p className="project-group">{plan.repo}</p>
        <div className="dev-error" role="alert">
          <p>読めませんでした。{plan.failure.reason}</p>
          <p className="muted">{failureHint}</p>
        </div>
      </div>
    );
  }
  const hasEntries = plan.entries.length > 0;
  const hasClosed = plan.closed.length > 0;
  return (
    <div className="panel dev-repo">
      <p className="project-group">{plan.repo}</p>
      {hasEntries ? (
        <ul className="dev-list">
          {plan.entries.map((entry) => (
            <EntryRow key={entry.issue.number} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="dev-empty muted">ready の Issue はありません。</p>
      )}
      <p className="dev-subhead">今日閉じた Issue</p>
      {hasClosed ? (
        <ul className="dev-list">
          {plan.closed.map((issue) => (
            <ClosedRow key={issue.number} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className="dev-empty muted">まだありません。</p>
      )}
    </div>
  );
};

/**
 * プロジェクトのシートの先頭の「今日の開発」節。連携リポジトリごとに予定と今日閉じた Issue を並べる。
 *
 * @remarks 取得は持たない。`useDevPlan` の結果を受け取って描画するだけ。
 */
export const DevPlanSection = (props: { plan: DevPlanState }) => {
  const { plan } = props;
  const isIdle = plan.status === "idle";
  if (isIdle) {
    return null;
  }
  return (
    <section className="section" aria-labelledby="dev-plan-title">
      <div className="section-head">
        <h3 id="dev-plan-title" className="section-title">
          今日の開発
        </h3>
      </div>
      <DevPlanBody plan={plan} />
    </section>
  );
};

const DevPlanBody = (props: { plan: Exclude<DevPlanState, { status: "idle" }> }) => {
  const { plan } = props;
  const isLoading = plan.status === "loading";
  if (isLoading) {
    return (
      <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-short" />
      </div>
    );
  }
  const hasRepos = plan.repos.length > 0;
  if (!hasRepos) {
    return <p className="panel panel-empty muted">kind: code で active の連携リポジトリがありません。</p>;
  }
  return (
    <>
      {plan.repos.map((repo) => (
        <RepoPlan key={repo.repo} plan={repo} />
      ))}
    </>
  );
};
