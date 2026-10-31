import { useState } from "react";
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
 * 1 つのリポジトリの進み具合を読む関数。テストで差し替える。
 */
export type LoadRoadmap = (settings: Settings, repo: string, now: Date) => Promise<ProjectRoadmap>;

/**
 * 進み具合の要求を出す口。
 */
export type RoadmapRequests = {
  /** 選んだプロジェクトの進み具合を読み始める。連携していなければ `idle` にする。 */
  load: (settings: Settings, project: ProjectSummary) => void;
  /** 一覧に戻ったときに `idle` にする。読み途中の応答は捨てる。 */
  reset: () => void;
};

/**
 * 進み具合の要求を出し、最後に出した要求の応答だけを `onChange` に渡す。
 *
 * @remarks 選び直しや一覧に戻った後に、前の要求の応答で上書きしないため、要求ごとに番号を振る。
 * @param onChange - 読み込みの状態を受け取る関数。
 * @param loadRoadmap - 進み具合を読む関数。
 * @returns 要求を出す口。
 */
export const createRoadmapRequests = (
  onChange: (state: ProjectRoadmapState) => void,
  loadRoadmap: LoadRoadmap = loadProjectRoadmap,
): RoadmapRequests => {
  let latest = 0;
  const load = (settings: Settings, project: ProjectSummary): void => {
    latest += 1;
    const requestId = latest;
    const repo = getRoadmapRepo(project);
    if (repo === undefined) {
      onChange({ status: "idle" });
      return;
    }
    onChange({ status: "loading" });
    void loadRoadmap(settings, repo, new Date()).then((roadmap) => {
      const isLatest = requestId === latest;
      if (isLatest) {
        onChange({ status: "ready", roadmap });
      }
    });
  };
  const reset = (): void => {
    latest += 1;
    onChange({ status: "idle" });
  };
  return { load, reset };
};

/**
 * プロジェクトの進み具合の読み込みの状態と、要求を出す口。
 *
 * @remarks 取得はプロジェクトを選ぶハンドラが `load` で始める。この hook は自分から読まない。
 * @returns 読み込みの状態と、`load` と `reset`。
 */
export const useProjectRoadmap = (): { state: ProjectRoadmapState } & RoadmapRequests => {
  const [state, setState] = useState<ProjectRoadmapState>({ status: "idle" });
  // setState は描画をまたいで同じなので、口も最初の 1 つを使い続ける。
  const [requests] = useState(() => createRoadmapRequests(setState));
  return { state, ...requests };
};
