import { describe, expect, it } from "vitest";
import { createLimiter } from "./limit";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
  it("同時に走る処理は limit を超えない", async () => {
    const run = createLimiter(3);
    let running = 0;
    let peak = 0;
    const task = async (): Promise<void> => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    };
    await Promise.all(Array.from({ length: 20 }, () => run(task)));
    expect(peak).toBe(3);
  });

  it("失敗した処理の後も、待っていた処理を走らせる", async () => {
    const run = createLimiter(1);
    const failed = run(() => Promise.reject(new Error("boom")));
    const next = run(() => Promise.resolve("next"));
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");
  });

  it("結果は処理ごとに返す", async () => {
    const run = createLimiter(2);
    const results = await Promise.all([1, 2, 3].map((value) => run(async () => value * 10)));
    expect(results).toEqual([10, 20, 30]);
  });
});
