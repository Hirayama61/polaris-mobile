import { describe, expect, it } from "vitest";
import { checkSlotInput } from "./slotInput";

describe("checkSlotInput", () => {
  it("時刻を HH:MM–HH:MM にし、やることの前後の空白を除く", () => {
    expect(checkSlotInput("07:00", "07:30", " 散歩 ")).toEqual({
      kind: "ok",
      time: "07:00–07:30",
      what: "散歩",
    });
  });

  it("開始か終了が空か形が違えば、時刻の誤りとして知らせる", () => {
    expect(checkSlotInput("", "07:30", "散歩")).toMatchObject({ kind: "invalid", field: "time" });
    expect(checkSlotInput("07:00", "", "散歩")).toMatchObject({ kind: "invalid", field: "time" });
    expect(checkSlotInput("7:00", "07:30", "散歩")).toMatchObject({ kind: "invalid", field: "time" });
  });

  it("やることが空なら、やることの誤りとして知らせる", () => {
    expect(checkSlotInput("07:00", "07:30", "  ")).toMatchObject({ kind: "invalid", field: "what" });
  });
});
