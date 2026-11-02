import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./settings";
import { type BlogLoadState, startBlogPostsLoad } from "./useBlogPosts";

const settings = { ...defaultSettings, token: "test-token" };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startBlogPostsLoad", () => {
  it("読み込みに失敗した後、もう一度呼ぶと取得し直して一覧を渡す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "Server Error" }, 500))
      .mockResolvedValue(json({ tree: [], truncated: false }));
    vi.stubGlobal("fetch", fetchMock);
    const states: BlogLoadState[] = [];
    const latest = { current: 0 };

    await startBlogPostsLoad(latest, settings, (state) => states.push(state));
    await startBlogPostsLoad(latest, settings, (state) => states.push(state));

    expect(states).toEqual([expect.objectContaining({ status: "error" }), { status: "ready", posts: [] }]);
  });

  it("未設定なら取得せず unconfigured を渡す", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const states: BlogLoadState[] = [];

    await startBlogPostsLoad({ current: 0 }, defaultSettings, (state) => states.push(state));

    expect([fetchMock.mock.calls.length, states]).toEqual([0, [{ status: "unconfigured" }]]);
  });
});
