import { useEffect, useState } from "react";
import { describeFailure } from "./failure";
import { listIssuesClosedSince, listMergedPullDates, listOpenIssues } from "./github";
import type { ProjectSummary } from "./projects";
import {
  countMergedByDay,
  getClosedWithin,
  getRecentDays,
  getRoadmapRepo,
  getRoadmapSince,
  type ProjectRoadmap,
  sortOpenIssues,
} from "./roadmap";
import type { Settings } from "./settings";

/**
 * プロジェクトの進み具合の読み込み。`idle` は連携していないプロジェクトか、選んでいないとき。
 */
export type ProjectRoadmapState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; roadmap: ProjectRoadmap };

/**
 * 1 つのリポジトリの進み具合を読む。
 *
 * @remarks 読めなかったときは例外にせず `error` を返す。シートの他の節の表示を止めないため。
 * @param settings - 接続設定。トークンだけを使う。
 * @param repo - `owner/name`。
 * @param now - 現在時刻。
 * @returns open の Issue、直近に閉じた Issue、日ごとのマージされた PR の数、または読めなかった理由。
 */
export const loadProjectRoadmap = async (
  settings: Settings,
  repo: string,
  now: Date,
): Promise<ProjectRoadmap> => {
  const days = getRecentDays(now);
  try {
    const [open, closed, mergedAts] = await Promise.all([
      listOpenIssues(settings, repo),
      listIssuesClosedSince(settings, repo, getRoadmapSince(now)),
      listMergedPullDates(settings, repo),
    ]);
    return {
      kind: "ready",
      repo,
      open: sortOpenIssues(open),
      closed: getClosedWithin(closed, days),
      merged: countMergedByDay(mergedAts, days),
    };
  } catch (error) {
    return { kind: "error", repo, failure: describeFailure(error) };
  }
};

/**
 * 選んだプロジェクトが連携プロジェクトなら、その進み具合を GitHub から読む。
 *
 * @param settings - 接続設定。トークンだけを使う。
 * @param project - 選んだプロジェクト。一覧を出しているときは undefined。
 * @returns 読み込みの状態。
 */
export const useProjectRoadmap = (
  settings: Settings,
  project: ProjectSummary | undefined,
): ProjectRoadmapState => {
  const [state, setState] = useState<ProjectRoadmapState>({ status: "idle" });
  const repo = getRoadmapRepo(project);

  useEffect(() => {
    if (repo === undefined) {
      setState({ status: "idle" });
      return undefined;
    }
    let isCancelled = false;
    setState({ status: "loading" });
    void loadProjectRoadmap(settings, repo, new Date()).then((roadmap) => {
      if (!isCancelled) {
        setState({ status: "ready", roadmap });
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [settings, repo]);

  return state;
};
