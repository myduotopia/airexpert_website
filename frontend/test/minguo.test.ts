import { describe, it, expect } from "vitest";
import { rocDate, isoToRocParts, rocPartsToIso } from "@/lib/admin/minguo";

describe("rocDate", () => {
  it("西元日期字串 → 民國顯示", () => {
    expect(rocDate("2023-04-20")).toBe("民國112/04/20");
    expect(rocDate("2026-05-23")).toBe("民國115/05/23");
  });
  it("空 / 無效回 —", () => {
    expect(rocDate(null)).toBe("—");
    expect(rocDate("")).toBe("—");
  });
});

describe("isoToRocParts / rocPartsToIso 往返", () => {
  it("ISO → 民國 年月日", () => {
    expect(isoToRocParts("2023-04-20")).toEqual({
      year: "112",
      month: "4",
      day: "20",
    });
    expect(isoToRocParts(null)).toEqual({ year: "", month: "", day: "" });
  });

  it("民國 年月日 → ISO（補零）", () => {
    expect(rocPartsToIso("112", "4", "20")).toBe("2023-04-20");
    expect(rocPartsToIso("115", "12", "1")).toBe("2026-12-01");
  });

  it("任一欄空或不合法 → 空字串", () => {
    expect(rocPartsToIso("112", "", "20")).toBe("");
    expect(rocPartsToIso("112", "13", "1")).toBe("");
    expect(rocPartsToIso("112", "4", "0")).toBe("");
  });
});
