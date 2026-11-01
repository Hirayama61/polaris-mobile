import { describe, expect, it } from "vitest";
import { describeFailure } from "./failure";
import { GitHubError } from "./github";

describe("describeFailure", () => {
  it("401 / 403 / 404 は設定の見直しを促す", () => {
    expect(describeFailure(new GitHubError(401, "401: Bad credentials")).action).toBe("settings");
    expect(describeFailure(new GitHubError(403, "403: Forbidden")).action).toBe("settings");
    expect(describeFailure(new GitHubError(404, "404: Not Found")).action).toBe("settings");
  });

  it("接続できないときと 5xx はやり直しを促す", () => {
    expect(describeFailure(new GitHubError(0, "GitHub に接続できません")).action).toBe("retry");
    const server = describeFailure(new GitHubError(502, "502: Bad Gateway"));
    expect(server).toEqual({
      reason: "502: Bad Gateway",
      hint: "少し待ってからもう一度試してください。",
      action: "retry",
    });
  });

  it("remaining が 0 の 403 と 429 は上限と解除時刻を伝え、設定に誘導しない", () => {
    const resetAt = new Date("2026-11-01T13:15:00Z");
    const expected = {
      reason: "GitHub の読み取りの上限に当たりました。22:15 に解除されます。",
      hint: "解除されたらもう一度試してください。",
      action: "retry",
    };
    expect(describeFailure(new GitHubError(403, "403: API rate limit exceeded", { resetAt }))).toEqual(
      expected,
    );
    expect(describeFailure(new GitHubError(429, "429: Too Many Requests", { resetAt }))).toEqual(expected);
  });

  it("解除時刻が分からない上限は時刻を出さずにやり直しを促す", () => {
    expect(describeFailure(new GitHubError(429, "429: Too Many Requests", { resetAt: undefined }))).toEqual({
      reason: "GitHub の読み取りの上限に当たりました。",
      hint: "しばらく待ってからもう一度試してください。",
      action: "retry",
    });
  });

  it("レート制限でない 403 は権限不足として設定に誘導する", () => {
    expect(describeFailure(new GitHubError(403, "403: Resource not accessible"))).toEqual({
      reason: "トークンにこの操作の権限がありません。",
      hint: "GitHub でトークンの権限を確かめてください。",
      action: "settings",
    });
  });

  it("GitHubError 以外はメッセージを理由にする", () => {
    expect(describeFailure(new Error("壊れた")).reason).toBe("壊れた");
    expect(describeFailure("文字列").reason).toBe("文字列");
  });
});
