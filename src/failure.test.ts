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

  it("GitHubError 以外はメッセージを理由にする", () => {
    expect(describeFailure(new Error("壊れた")).reason).toBe("壊れた");
    expect(describeFailure("文字列").reason).toBe("文字列");
  });
});
