import { describe, expect, it } from "vitest";
import { toKeyedItems } from "./keys";

describe("toKeyedItems", () => {
  it("要素の順を保ち、元の文字列を key にする", () => {
    expect(toKeyedItems(["a", "b"], (item) => item)).toEqual([
      { key: "a", item: "a" },
      { key: "b", item: "b" },
    ]);
  });

  it("同じ値が並んだら 2 件目から出現回数を足す", () => {
    const keys = toKeyedItems(["a", "b", "a", "a"], (item) => item).map(({ key }) => key);
    expect(keys).toEqual(["a", "b", "a#2", "a#3"]);
  });

  it("空の一覧なら空", () => {
    expect(toKeyedItems([], (item: string) => item)).toEqual([]);
  });
});
