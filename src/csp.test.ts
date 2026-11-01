import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, getCspMetaTag } from "./csp";

describe("CONTENT_SECURITY_POLICY", () => {
  it("通信先を自身と api.github.com だけに絞る", () => {
    expect(CONTENT_SECURITY_POLICY).toBe("connect-src 'self' https://api.github.com");
  });
});

describe("getCspMetaTag", () => {
  it("CSP の meta を head の先頭に入れる記述を返す", () => {
    expect(getCspMetaTag()).toEqual({
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
      injectTo: "head-prepend",
    });
  });
});
