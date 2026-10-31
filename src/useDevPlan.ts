import { useEffect, useState } from "react";
import {
  type DevRepoPlan,
  getClosedSince,
  getDevRepos,
  getSlotHours,
  isClosedToday,
  planDevIssues,
} from "./devPlan";
import { describeFailure } from "./failure";
import { listIssuesClosedSince, listOpenPullHeadRefs, listReadyIssues } from "./github";
import type { ProjectSummary } from "./projects";
import type { Settings } from "./settings";

/**
 * 「今日の開発」の読み込み。`idle` はプロジェクトの一覧がまだ無いとき。
 */
export type DevPlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; repos: DevRepoPlan[] };

const loadRepoPlan = async (settings: Settings, repo: string, now: Date): Promise<DevRepoPlan> => {
  try {
    const [ready, headRefs, closed] = await Promise.all([
      listReadyIssues(settings, repo),
      listOpenPullHeadRefs(settings, repo),
      listIssuesClosedSince(settings, repo, getClosedSince(now)),
    ]);
    const entries = planDevIssues(ready, headRefs, getSlotHours(now));
    const closedToday = closed.filter((issue) => isClosedToday(issue, now));
    return { kind: "ready", repo, entries, closed: closedToday };
  } catch (error) {
    return { kind: "error", repo, failure: describeFailure(error) };
  }
};

/**
 * プロジェクトの一覧から連携リポジトリを選び、それぞれの「今日の開発」を GitHub から読む。
 *
 * @remarks 読めないリポジトリは `error` として結果に入れ、他のリポジトリは表示できるようにする。
 * @param settings - 接続設定。トークンだけを使う。
 * @param projects - プロジェクトの一覧。読み込み前は undefined。
 * @returns 読み込みの状態。
 */
export const useDevPlan = (
  settings: Settings,
  projects: readonly ProjectSummary[] | undefined,
): DevPlanState => {
  const [state, setState] = useState<DevPlanState>({ status: "idle" });

  useEffect(() => {
    if (projects === undefined) {
      setState({ status: "idle" });
      return undefined;
    }
    let isCancelled = false;
    const now = new Date();
    setState({ status: "loading" });
    void Promise.all(getDevRepos(projects).map((repo) => loadRepoPlan(settings, repo, now))).then((repos) => {
      if (!isCancelled) {
        setState({ status: "ready", repos });
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [settings, projects]);

  return state;
};
