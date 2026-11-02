/**
 * プロジェクトのシートの「これから」「済んだこと」「マージされた PR」を組む (純粋関数)。
 *
 * @remarks 取得は持たない。`useProjectRoadmap` が GitHub から読んでここに渡す。
 */
import { polarisToday } from "./clock";
import { isDevProject } from "./devPlan";
import type { Failure } from "./failure";
import type { ProjectSummary } from "./projects";
import type { RepoIssue, RepoOpenIssue } from "./repoEntries";

/**
 * 1 日分のマージされた PR の数。`date` は `YYYY-MM-DD` (東京、4 時が境界)。
 */
export type DayCount = { date: string; count: number };

/**
 * 1 つのリポジトリの進み具合。読めなければ `error`。
 */
export type ProjectRoadmap =
  | { kind: "ready"; repo: string; open: RepoOpenIssue[]; closed: RepoIssue[]; merged: DayCount[] }
  | { kind: "error"; repo: string; failure: Failure };

/** 「済んだこと」とグラフに出す日数。今日を含む。 */
export const ROADMAP_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

const shiftDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * 今日までの直近の日付を並べる。
 *
 * @param now - 現在時刻。
 * @returns `ROADMAP_DAYS` 日分の `YYYY-MM-DD`。古い順で、最後が今日。
 */
export const getRecentDays = (now: Date): string[] => {
  const today = polarisToday(now);
  return Array.from({ length: ROADMAP_DAYS }, (_, index) => shiftDate(today, index - ROADMAP_DAYS + 1));
};

/**
 * 閉じた Issue を探しに行く起点。直近の日付の最初の日の 4 時 (東京)。
 *
 * @param now - 現在時刻。
 * @returns ISO 8601 (UTC)。
 */
export const getRoadmapSince = (now: Date): string => {
  const [firstDay] = getRecentDays(now);
  return new Date(`${firstDay}T04:00:00+09:00`).toISOString();
};

/**
 * 進み具合を読みに行くリポジトリを選ぶ。
 *
 * @param project - 選んだプロジェクト。一覧を出しているときは undefined。
 * @returns 連携プロジェクト (`isDevProject`) の `owner/name`。それ以外は undefined。
 */
export const getRoadmapRepo = (project: ProjectSummary | undefined): string | undefined => {
  if (project === undefined || !isDevProject(project)) {
    return undefined;
  }
  return project.github;
};

/**
 * 直近の日付のうちに閉じた Issue か。
 *
 * @param issue - Issue。
 * @param days - `getRecentDays` の結果。
 * @returns 閉じた日時が無ければ false。
 */
export const isClosedWithin = (issue: RepoIssue, days: readonly string[]): boolean => {
  if (issue.closedAt === undefined) {
    return false;
  }
  return days.includes(polarisToday(new Date(issue.closedAt)));
};

/**
 * 直近の日付のうちに閉じた Issue を、新しく閉じた順に選ぶ。
 *
 * @param issues - closed の Issue。
 * @param days - `getRecentDays` の結果。
 * @returns 閉じた日時の無いものは除く。
 */
export const getClosedWithin = (issues: readonly RepoIssue[], days: readonly string[]): RepoIssue[] =>
  issues
    .filter((issue) => isClosedWithin(issue, days))
    .sort((a, b) => Date.parse(b.closedAt ?? "") - Date.parse(a.closedAt ?? ""));

/**
 * open の Issue を番号順に並べる。
 *
 * @param issues - open の Issue。
 * @returns 新しい配列。
 */
export const sortOpenIssues = (issues: readonly RepoOpenIssue[]): RepoOpenIssue[] =>
  [...issues].sort((a, b) => a.number - b.number);

/**
 * マージ日時を日ごとに数える。
 *
 * @param mergedAts - マージ日時 (ISO 8601)。
 * @param days - `getRecentDays` の結果。
 * @returns `days` の順の件数。範囲外の日時は数えない。
 */
export const countMergedByDay = (mergedAts: readonly string[], days: readonly string[]): DayCount[] => {
  const mergedDays = mergedAts.map((mergedAt) => polarisToday(new Date(mergedAt)));
  return days.map((date) => ({ date, count: mergedDays.filter((mergedDay) => mergedDay === date).length }));
};

/**
 * 棒の高さを求める。いちばん多い日を `fullHeight` にそろえる。
 *
 * @param count - その日の件数。
 * @param max - 期間でいちばん多い日の件数。
 * @param fullHeight - 棒の最大の高さ。
 * @returns 0 件か、期間に 1 件も無ければ 0。
 */
export const getBarHeight = (count: number, max: number, fullHeight: number): number => {
  const hasAny = max > 0;
  if (!hasAny) {
    return 0;
  }
  return (count / max) * fullHeight;
};

/**
 * グラフの目盛りに出す短い日付。
 *
 * @param date - `YYYY-MM-DD`。
 * @returns 例: `10/31`。
 */
export const formatShortDate = (date: string): string => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};
