import { describe, expect, it } from "vitest";
import { getEvictedShas, getTouchedOrder } from "./blobCache";

describe("getTouchedOrder", () => {
  it("使った sha を末尾に移し、重複させない", () => {
    expect(getTouchedOrder(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });

  it("初めての sha は末尾に足す", () => {
    expect(getTouchedOrder(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("getEvictedShas", () => {
  it("上限を超えた分を古い方から返す", () => {
    expect(getEvictedShas(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
  });

  it("上限以内なら何も捨てない", () => {
    expect(getEvictedShas(["a", "b"], 2)).toEqual([]);
  });

  it("上限が 0 未満でも全件までしか返さない", () => {
    expect(getEvictedShas(["a"], -5)).toEqual(["a"]);
  });
});
