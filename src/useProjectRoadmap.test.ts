import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "./projects";
import type { ProjectRoadmap } from "./roadmap";
import { defaultSettings } from "./settings";
import { createRoadmapRequests, loadProjectRoadmap, type ProjectRoadmapState } from "./useProjectRoadmap";

const settings = { ...defaultSettings, token: "test-token" };
// 東京の 2026-10-31 22:00。直近 14 日は 10-18 から。
const now = new Date("2026-10-31T22:00:00+09:00");

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// URL のパスとクエリの先頭で応答を返す。どれにも当たらなければ 404。
const stubGitHub = (routes: Record<string, unknown>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = Object.keys(routes).find((prefix) => `${url.pathname}${url.search}`.startsWith(prefix));
    if (key === undefined) {
      return json({ message: "Not Found" }, 404);
    }
    return json(routes[key]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadProjectRoadmap", () => {
  it("open の Issue をラベル付きで、閉じた Issue と日ごとのマージ数を 14 日分で組む", async () => {
    const fetchMock = stubGitHub({
      "/repos/o/a/issues?state=open": [
        { number: 12, title: "後の Issue", labels: [{ name: "needs-info" }] },
        { number: 11, title: "先の Issue", labels: [{ name: "ready" }, { color: "fff" }] },
        { number: 13, title: "PR そのもの", pull_request: {}, labels: [] },
      ],
      "/repos/o/a/issues?state=closed": [
        { number: 5, title: "今日閉じた", closed_at: "2026-10-31T03:00:00Z" },
        { number: 4, title: "期間外", closed_at: "2026-10-10T10:00:00Z" },
      ],
      "/repos/o/a/pulls?state=closed": [
        { number: 9, merged_at: "2026-10-31T01:00:00Z" },
        { number: 8, merged_at: "2026-10-31T02:00:00Z" },
        { number: 7, merged_at: null },
        { number: 6, merged_at: "2026-10-18T10:00:00+09:00" },
      ],
    });
    const roadmap = await loadProjectRoadmap(settings, "o/a", now);
    expect(roadmap.kind).toBe("ready");
    if (roadmap.kind !== "ready") {
      return;
    }
    expect(roadmap.open).toEqual([
      { number: 11, title: "先の Issue", labels: ["ready"] },
      { number: 12, title: "後の Issue", labels: ["needs-info"] },
    ]);
    expect(roadmap.closed).toEqual([{ number: 5, title: "今日閉じた", closedAt: "2026-10-31T03:00:00Z" }]);
    expect(roadmap.merged).toHaveLength(14);
    expect(roadmap.merged[0]).toEqual({ date: "2026-10-18", count: 1 });
    expect(roadmap.merged[13]).toEqual({ date: "2026-10-31", count: 2 });
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.every((url) => url.origin === "https://api.github.com")).toBe(true);
  });

  it("読めなければ例外にせず error を返す", async () => {
    stubGitHub({});
    const roadmap = await loadProjectRoadmap(settings, "o/missing", now);
    expect(roadmap).toMatchObject({ kind: "error", repo: "o/missing" });
  });
});

const project = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  slug: "polaris",
  name: "Polaris",
  isRetired: false,
  status: "active",
  kind: "code",
  github: "o/a",
  body: "",
  ...overrides,
});

const roadmapOf = (repo: string): ProjectRoadmap => ({
  kind: "ready",
  repo,
  open: [],
  closed: [],
  merged: [],
});

// 呼ばれた順に応答を保留し、テストから任意の順で返す。
const deferredLoader = () => {
  const pending: { repo: string; resolve: (roadmap: ProjectRoadmap) => void }[] = [];
  const loadRoadmap = vi.fn(
    (_settings: unknown, repo: string) =>
      new Promise<ProjectRoadmap>((resolve) => {
        pending.push({ repo, resolve });
      }),
  );
  return { loadRoadmap, pending };
};

describe("createRoadmapRequests", () => {
  it("連携プロジェクトを選ぶと loading にしてから、読んだ進み具合で ready にする", async () => {
    const states: ProjectRoadmapState[] = [];
    const { loadRoadmap, pending } = deferredLoader();
    const requests = createRoadmapRequests((state) => states.push(state), loadRoadmap);
    requests.load(settings, project({}));
    expect(states).toEqual([{ status: "loading" }]);
    expect(loadRoadmap).toHaveBeenCalledWith(settings, "o/a", expect.any(Date));
    pending[0]?.resolve(roadmapOf("o/a"));
    await Promise.resolve();
    expect(states.at(-1)).toEqual({ status: "ready", roadmap: roadmapOf("o/a") });
  });

  it("連携していないプロジェクトを選ぶと読まずに idle にする", () => {
    const states: ProjectRoadmapState[] = [];
    const { loadRoadmap } = deferredLoader();
    const requests = createRoadmapRequests((state) => states.push(state), loadRoadmap);
    requests.load(settings, project({ github: undefined }));
    expect(states).toEqual([{ status: "idle" }]);
    expect(loadRoadmap).not.toHaveBeenCalled();
  });

  it("選び直したら、前の要求の応答が後から届いても上書きしない", async () => {
    const states: ProjectRoadmapState[] = [];
    const { loadRoadmap, pending } = deferredLoader();
    const requests = createRoadmapRequests((state) => states.push(state), loadRoadmap);
    requests.load(settings, project({ github: "o/a" }));
    requests.load(settings, project({ slug: "b", github: "o/b" }));
    pending[1]?.resolve(roadmapOf("o/b"));
    pending[0]?.resolve(roadmapOf("o/a"));
    await Promise.resolve();
    expect(states.at(-1)).toEqual({ status: "ready", roadmap: roadmapOf("o/b") });
  });

  it("一覧に戻った後に届いた応答は捨てて idle のままにする", async () => {
    const states: ProjectRoadmapState[] = [];
    const { loadRoadmap, pending } = deferredLoader();
    const requests = createRoadmapRequests((state) => states.push(state), loadRoadmap);
    requests.load(settings, project({}));
    requests.reset();
    pending[0]?.resolve(roadmapOf("o/a"));
    await Promise.resolve();
    expect(states).toEqual([{ status: "loading" }, { status: "idle" }]);
  });
});
