import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./settings";
import { type DailyState, startDailyLoad } from "./useDaily";

const settings = { ...defaultSettings, token: "test-token" };
const path = "daily/2026-11-02.md";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const found = (content: string, sha: string): Response =>
  json({ sha, encoding: "base64", content: Buffer.from(content).toString("base64") });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startDailyLoad", () => {
  it("読み込みに失敗した後、もう一度呼ぶと取得し直して読めた内容を渡す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "Server Error" }, 500))
      .mockResolvedValueOnce(found("# 今日", "sha-1"));
    vi.stubGlobal("fetch", fetchMock);
    const states: DailyState[] = [];
    const latest = { current: 0 };

    await startDailyLoad(latest, settings, path, (state) => states.push(state));
    await startDailyLoad(latest, settings, path, (state) => states.push(state));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.map((state) => state.status)).toEqual(["loading", "error", "loading", "ready"]);
    expect(states.at(-1)).toEqual({
      status: "ready",
      content: "# 今日",
      sha: "sha-1",
      freshness: { kind: "fresh" },
    });
  });

  it("後から読み直しを始めたら、先の読み込みの応答は渡さない", async () => {
    let resolveFirst: (response: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(found("# 新しい", "sha-new"));
    vi.stubGlobal("fetch", fetchMock);
    const states: DailyState[] = [];
    const latest = { current: 0 };

    const first = startDailyLoad(latest, settings, path, (state) => states.push(state));
    await startDailyLoad(latest, settings, path, (state) => states.push(state));
    resolveFirst(found("# 古い", "sha-old"));
    await first;

    expect(states.at(-1)).toMatchObject({ status: "ready", content: "# 新しい" });
  });

  it("未設定なら取得せず unconfigured を渡す", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const states: DailyState[] = [];

    await startDailyLoad({ current: 0 }, defaultSettings, path, (state) => states.push(state));

    expect([fetchMock.mock.calls.length, states]).toEqual([0, [{ status: "unconfigured" }]]);
  });
});
