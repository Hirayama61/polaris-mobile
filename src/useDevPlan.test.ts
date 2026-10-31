import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./settings";
import { loadDevPlans, loadRepoPlan } from "./useDevPlan";

const settings = { ...defaultSettings, token: "test-token" };
// 東京の 2026-10-31 22:00。残りの枠は 23 時と 24 時。
const now = new Date("2026-10-31T22:00:00+09:00");

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// URL の repo とパスで応答を返す。どれにも当たらなければ 404。
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

const okRoutes = (repo: string) => ({
  [`/repos/${repo}/issues?state=open&labels=ready`]: [
    { number: 12, title: "後の Issue" },
    { number: 10, title: "PR のある Issue" },
    { number: 11, title: "先の Issue" },
    { number: 13, title: "枠に入らない Issue" },
    { number: 14, title: "PR そのもの", pull_request: {} },
  ],
  [`/repos/${repo}/pulls?state=open`]: [{ head: { ref: "claude/issue-10" } }, { head: { ref: "feature/x" } }],
  [`/repos/${repo}/issues?state=closed`]: [
    { number: 5, title: "今日閉じた", closed_at: "2026-10-31T03:00:00Z" },
    { number: 4, title: "昨日閉じた", closed_at: "2026-10-30T10:00:00Z" },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadRepoPlan", () => {
  it("Issue・PR・閉じた Issue の 3 つの応答から予定と今日閉じた Issue を組む", async () => {
    stubGitHub(okRoutes("o/a"));
    const plan = await loadRepoPlan(settings, "o/a", now);
    expect(plan).toEqual({
      kind: "ready",
      repo: "o/a",
      entries: [
        { kind: "pr", issue: { number: 10, title: "PR のある Issue", closedAt: undefined } },
        { kind: "slot", hour: 23, issue: { number: 11, title: "先の Issue", closedAt: undefined } },
        { kind: "slot", hour: 24, issue: { number: 12, title: "後の Issue", closedAt: undefined } },
        { kind: "later", issue: { number: 13, title: "枠に入らない Issue", closedAt: undefined } },
      ],
      closed: [{ number: 5, title: "今日閉じた", closedAt: "2026-10-31T03:00:00Z" }],
    });
  });

  it("読めないときは例外にせず error を返す", async () => {
    stubGitHub({});
    const plan = await loadRepoPlan(settings, "o/missing", now);
    expect(plan.kind).toBe("error");
  });

  it("通信先は api.github.com だけ", async () => {
    const fetchMock = stubGitHub(okRoutes("o/a"));
    await loadRepoPlan(settings, "o/a", now);
    const hosts = fetchMock.mock.calls.map(([input]) => new URL(String(input)).host);
    expect(new Set(hosts)).toEqual(new Set(["api.github.com"]));
  });
});

describe("loadDevPlans", () => {
  it("片方のリポジトリが 404 でも、もう片方の予定は ready で入る", async () => {
    stubGitHub(okRoutes("o/a"));
    const plans = await loadDevPlans(settings, ["o/missing", "o/a"], now);
    expect(plans.map((plan) => [plan.repo, plan.kind])).toEqual([
      ["o/missing", "error"],
      ["o/a", "ready"],
    ]);
  });
});
