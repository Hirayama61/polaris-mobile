import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../settings";
import { canSendBlogIdea, sendBlogIdea } from "./useBlogIdea";

const settings = { ...defaultSettings, token: "test-token" };
// 東京の 2026-10-31 08:15。
const now = new Date("2026-10-31T08:15:00+09:00");
const zero = (): number => 0;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canSendBlogIdea", () => {
  it("本文があり、トークンがあり、送っていなければ押せる", () => {
    expect(canSendBlogIdea("# 題", { status: "idle" }, true)).toBe(true);
  });

  it("送信中は押せない (二度送らない)", () => {
    expect(canSendBlogIdea("# 題", { status: "sending" }, true)).toBe(false);
  });

  it("本文が空白だけなら押せない", () => {
    expect(canSendBlogIdea(" \n", { status: "idle" }, true)).toBe(false);
  });

  it("トークンが無ければ押せない", () => {
    expect(canSendBlogIdea("# 題", { status: "idle" }, false)).toBe(false);
  });

  it("失敗の後は押し直せる", () => {
    const failure = { reason: "r", hint: "h", action: "retry" as const };
    expect(canSendBlogIdea("# 題", { status: "error", failure }, true)).toBe(true);
  });
});

describe("sendBlogIdea", () => {
  it("ideas に sha を付けずに新しいファイルとして書き、そのパスを返す", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ content: { sha: "new-sha" } }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);

    const path = await sendBlogIdea(settings, "# 題\n", now, zero);

    expect(path).toBe("writing/blog/ideas/20261031-0000.md");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).hostname).toBe("api.github.com");
    expect(String(input)).toContain("writing/blog/ideas/20261031-0000.md");
    expect(init?.method).toBe("PUT");
    const sent = JSON.parse(String(init?.body));
    expect(sent).not.toHaveProperty("sha");
  });

  it("同じパスが既にあって断られたら失敗を返す (上書きしない)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ message: "sha wasn't supplied" }, 422)),
    );

    await expect(sendBlogIdea(settings, "# 題\n", now, zero)).rejects.toThrow();
  });
});
