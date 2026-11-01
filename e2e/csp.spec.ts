import { expect, test } from "@playwright/test";
import { CONTENT_SECURITY_POLICY } from "../src/csp";

test("本番ビルドの index.html に通信先を絞る CSP の meta がある", async ({ page }) => {
  await page.goto("./");
  const meta = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(meta).toHaveAttribute("content", CONTENT_SECURITY_POLICY);
});

test("api.github.com 以外への fetch はブラウザが止める", async ({ page }) => {
  let reached = false;
  await page.route("https://example.com/**", async (route) => {
    reached = true;
    await route.fulfill({ body: "ok" });
  });
  await page.goto("./");
  const result = await page.evaluate(async () => {
    try {
      await fetch("https://example.com/leak");
      return "sent";
    } catch {
      return "blocked";
    }
  });
  expect(result).toBe("blocked");
  expect(reached).toBe(false);
});
