/**
 * 「今日の開発」: 連携リポジトリの `ready` の Issue を今日の毎時の枠に割り当て、今日閉じた Issue を選ぶ (純粋関数)。
 *
 * @remarks 取得は持たない。`useDevPlan` が GitHub から読んでここに渡す。
 */
import { polarisToday, tokyoMinutesOfDay } from "./clock";
import type { Failure } from "./failure";
import type { ProjectSummary } from "./projects";
import type { RepoIssue } from "./repoEntries";

/**
 * 予定の 1 行。`slot` は枠に入った Issue、`pr` は PR が出ている Issue、`later` は枠が足りず今日に入らない Issue。
 */
export type DevPlanEntry =
  | { kind: "slot"; hour: number; issue: RepoIssue }
  | { kind: "pr"; issue: RepoIssue }
  | { kind: "later"; issue: RepoIssue };

/**
 * 1 つのリポジトリの「今日の開発」。読めなければ `error`。
 */
export type DevRepoPlan =
  | { kind: "ready"; repo: string; entries: DevPlanEntry[]; closed: RepoIssue[] }
  | { kind: "error"; repo: string; failure: Failure };

const FIRST_SLOT_HOUR = 7;
const LAST_SLOT_HOUR = 24;
// clock.ts の polarisToday と同じ境界。0〜4 時は前日の続きなので、今日の枠は残っていない。
const DAY_BOUNDARY_HOUR = 4;
const PR_BRANCH_PATTERN = /^claude\/issue-(\d+)$/;

/**
 * 「今日の開発」に出すプロジェクトか。
 *
 * @param project - プロジェクト。
 * @returns `kind: code`、`status: active`、`github:` があれば true。
 */
export const isDevProject = (project: ProjectSummary): boolean =>
  project.kind === "code" && project.status === "active" && project.github !== undefined;

/**
 * 「今日の開発」に出すリポジトリを選ぶ。
 *
 * @param projects - プロジェクトの一覧。
 * @returns `owner/name`。重なりは除き、一覧の順を保つ。
 */
export const getDevRepos = (projects: readonly ProjectSummary[]): string[] => {
  const repos = projects.filter(isDevProject).flatMap((project) => project.github ?? []);
  return [...new Set(repos)];
};

/**
 * 今から割り当てられる毎時の枠を求める。
 *
 * @param now - 現在時刻。
 * @returns 今の時刻の次の時から 24 時までのうち、7 時以降の時 (東京)。0〜4 時は空。
 */
export const getSlotHours = (now: Date): number[] => {
  const hour = Math.floor(tokyoMinutesOfDay(now) / 60);
  const isAfterMidnight = hour < DAY_BOUNDARY_HOUR;
  if (isAfterMidnight) {
    return [];
  }
  const first = Math.max(FIRST_SLOT_HOUR, hour + 1);
  const count = Math.max(0, LAST_SLOT_HOUR - first + 1);
  return Array.from({ length: count }, (_, index) => first + index);
};

/**
 * PR のブランチ名から Issue 番号を取り出す。
 *
 * @param headRef - PR の head のブランチ名。
 * @returns `claude/issue-<番号>` の番号。形が違えば undefined。
 */
export const getPrIssueNumber = (headRef: string): number | undefined => {
  const match = PR_BRANCH_PATTERN.exec(headRef);
  if (match === null) {
    return undefined;
  }
  return Number(match[1]);
};

/**
 * Issue を番号順に並べ、PR の無いものを枠に 1 件ずつ割り当てる。
 *
 * @param issues - open で `ready` の Issue。
 * @param headRefs - open の PR の head のブランチ名。
 * @param hours - 割り当てる枠 (`getSlotHours`)。
 * @returns 番号順の予定。
 */
export const planDevIssues = (
  issues: readonly RepoIssue[],
  headRefs: readonly string[],
  hours: readonly number[],
): DevPlanEntry[] => {
  const prIssueNumbers = new Set(headRefs.map(getPrIssueNumber));
  const sorted = [...issues].sort((a, b) => a.number - b.number);
  let nextSlot = 0;
  return sorted.map((issue): DevPlanEntry => {
    const hasPr = prIssueNumbers.has(issue.number);
    if (hasPr) {
      return { kind: "pr", issue };
    }
    const hour = hours[nextSlot];
    nextSlot += 1;
    if (hour === undefined) {
      return { kind: "later", issue };
    }
    return { kind: "slot", hour, issue };
  });
};

/**
 * 今日 (東京、4 時が境界) 閉じた Issue か。
 *
 * @param issue - Issue。
 * @param now - 現在時刻。
 * @returns 閉じた日時が無ければ false。
 */
export const isClosedToday = (issue: RepoIssue, now: Date): boolean => {
  if (issue.closedAt === undefined) {
    return false;
  }
  return polarisToday(new Date(issue.closedAt)) === polarisToday(now);
};

/**
 * 閉じた Issue を探しに行く起点。今日の始まり (4 時) は最大で 24 時間前なので、それより少し前にする。
 *
 * @param now - 現在時刻。
 * @returns ISO 8601 (UTC)。
 */
export const getClosedSince = (now: Date): string =>
  new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();

/**
 * 予定の 1 行の左に出す言葉。
 *
 * @param entry - 予定の 1 行。
 * @returns 例: `11 時ごろ`、`PR あり`、`明日以降`。
 */
export const getEntryLabel = (entry: DevPlanEntry): string => {
  switch (entry.kind) {
    case "slot":
      return `${entry.hour} 時ごろ`;
    case "pr":
      return "PR あり";
    case "later":
      return "明日以降";
  }
};

/**
 * 読めなかったリポジトリの次の一手を、そのリポジトリに合わせて言い直す。
 *
 * @param failure - `describeFailure` の結果。
 * @param repo - `owner/name`。
 * @returns 設定の見直しが要るときは、トークンの対象に足す案内。それ以外は元の案内。
 */
export const getRepoFailureHint = (failure: Failure, repo: string): string => {
  const needsSettings = failure.action === "settings";
  if (needsSettings) {
    return `GitHub でトークンの対象に ${repo} を足し、Issues と Pull requests の読み取りを許してください。`;
  }
  return failure.hint;
};
