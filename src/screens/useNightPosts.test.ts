import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings";
import { type PostsState, startPostsLoad } from "./useNightPosts";

const settings = { ...defaultSettings, token: "test-token" };
const date = "2026-11-02";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startPostsLoad", () => {
  it("読み込みに失敗した後、もう一度呼ぶと取得し直して一覧を渡す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "Server Error" }, 500))
      .mockResolvedValueOnce(json({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    const states: PostsState[] = [];
    const latest = { current: 0 };

    await startPostsLoad(latest, settings, date, (state) => states.push(state));
    await startPostsLoad(latest, settings, date, (state) => states.push(state));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.map((state) => state.status)).toEqual(["error", "ready"]);
  });

  it("取り消した後に届いた応答は渡さない", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    const states: PostsState[] = [];
    const latest = { current: 0 };

    const loading = startPostsLoad(latest, settings, date, (state) => states.push(state));
    latest.current += 1;
    resolveFetch(json({ message: "Not Found" }, 404));
    await loading;

    expect(states).toEqual([]);
  });
});
