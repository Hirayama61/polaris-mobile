import { describe, expect, it } from "vitest";
import { formatTokyoIso, polarisToday } from "./clock";

describe("polarisToday", () => {
  it("日中はその日を返す", () => {
    expect(polarisToday(new Date("2026-10-30T12:00:00+09:00"))).toBe("2026-10-30");
  });

  it("0:00〜4:00 は前日を返す", () => {
    expect(polarisToday(new Date("2026-10-31T00:00:00+09:00"))).toBe("2026-10-30");
    expect(polarisToday(new Date("2026-10-31T03:59:59+09:00"))).toBe("2026-10-30");
    expect(polarisToday(new Date("2026-10-31T04:00:00+09:00"))).toBe("2026-10-31");
  });

  it("月またぎと年またぎでも前日を返す", () => {
    expect(polarisToday(new Date("2026-11-01T01:00:00+09:00"))).toBe("2026-10-31");
    expect(polarisToday(new Date("2027-01-01T02:00:00+09:00"))).toBe("2026-12-31");
  });

  it("端末のタイムゾーンに依存しない(UTC で渡しても東京の日付)", () => {
    expect(polarisToday(new Date("2026-10-30T20:00:00Z"))).toBe("2026-10-31");
  });
});

describe("formatTokyoIso", () => {
  it("+09:00 つきの ISO 8601 を返す", () => {
    expect(formatTokyoIso(new Date("2026-10-30T13:15:07Z"))).toBe(
      "2026-10-30T22:15:07+09:00",
    );
  });
});
