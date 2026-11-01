import { describe, expect, it } from "vitest";
import { hasSavedReview, isReviewChanged } from "./nightReview";

describe("isReviewChanged", () => {
  it.each<[string, string, string, boolean]>([
    ["書き直した", "よく歩いた", "よく寝た", true],
    ["全部消した", "", "よく寝た", true],
    ["空白だけにした", "  \n", "よく寝た", true],
    ["前後の空白だけが違う", "よく寝た\n", "よく寝た", false],
    ["どちらも空", "", "", false],
    ["空の振り返りに書いた", "よく歩いた", "", true],
  ])("%s", (_, review, existingReview, expected) => {
    expect(isReviewChanged(review, existingReview)).toBe(expected);
  });
});

describe("hasSavedReview", () => {
  it.each<[string, string, boolean]>([
    ["書いてある", "よく寝た", true],
    ["空", "", false],
    ["空白だけ", " \n", false],
  ])("%s", (_, existingReview, expected) => {
    expect(hasSavedReview(existingReview)).toBe(expected);
  });
});
