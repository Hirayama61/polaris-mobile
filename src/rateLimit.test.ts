import { describe, expect, it } from "vitest";
import { getRateLimit } from "./rateLimit";

const NOW = new Date("2026-11-01T05:00:00Z");

describe("getRateLimit", () => {
  it("remaining が 0 の 403 は x-ratelimit-reset を解除時刻にする", () => {
    const headers = new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1793512800" });
    expect(getRateLimit(403, headers, NOW)).toEqual({ resetAt: new Date(1793512800 * 1000) });
  });

  it("429 は retry-after を x-ratelimit-reset より優先する", () => {
    const headers = new Headers({ "retry-after": "60", "x-ratelimit-reset": "1793512800" });
    expect(getRateLimit(429, headers, NOW)).toEqual({ resetAt: new Date("2026-11-01T05:01:00Z") });
  });

  it("解除時刻のヘッダーが無い 429 は解除時刻を持たない", () => {
    expect(getRateLimit(429, new Headers(), NOW)).toEqual({ resetAt: undefined });
  });

  it("remaining が 0 でない 403 はレート制限ではない", () => {
    const headers = new Headers({ "x-ratelimit-remaining": "4999", "x-ratelimit-reset": "1793512800" });
    expect(getRateLimit(403, headers, NOW)).toBeUndefined();
  });

  it("remaining が 0 でも 403 と 429 以外はレート制限ではない", () => {
    expect(getRateLimit(500, new Headers({ "x-ratelimit-remaining": "0" }), NOW)).toBeUndefined();
  });
});
