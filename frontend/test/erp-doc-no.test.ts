import { describe, it, expect } from "vitest";
import {
  DOC_TYPE_LABEL,
  DOC_TYPE_PREFIX,
  PAYMENT_PREFIX,
  formatDocNo,
  rocPeriod,
} from "@/lib/erp/doc-no";
import { DOC_TYPES } from "@/lib/erp/types";

// 單號規則（spec §4.2）：prefix + 民國年(3) + 月(2) + 流水號(3，超過 999 變 4 位)。

describe("rocPeriod", () => {
  it("西元日期 → 民國年月", () => {
    expect(rocPeriod("2026-09-15")).toBe("11509");
    expect(rocPeriod("2026-12-31")).toBe("11512");
    expect(rocPeriod("2011-01-01")).toBe("10001");
  });
  it("民國年不足 3 位時補 0", () => {
    expect(rocPeriod("1999-07-01")).toBe("08807");
  });
  it("格式錯誤丟錯", () => {
    expect(() => rocPeriod("115/09/15")).toThrow();
    expect(() => rocPeriod("")).toThrow();
  });
});

describe("formatDocNo", () => {
  it("對照現行單據", () => {
    expect(formatDocNo("S", "2026-09-15", 47)).toBe("S11509047");
    expect(formatDocNo("P", "2026-09-01", 8)).toBe("P11509008");
    expect(formatDocNo("SR", "2026-09-30", 1)).toBe("SR11509001");
    expect(formatDocNo(PAYMENT_PREFIX.in, "2026-09-02", 1)).toBe("RC11509001");
    expect(formatDocNo(PAYMENT_PREFIX.out, "2026-09-02", 12)).toBe(
      "PM11509012",
    );
  });
  it("流水號 999 以上自然變 4 位", () => {
    expect(formatDocNo("S", "2026-09-15", 999)).toBe("S11509999");
    expect(formatDocNo("S", "2026-09-15", 1000)).toBe("S115091000");
  });
});

describe("單別常數", () => {
  it("每個單別都有前綴與中文名稱", () => {
    for (const t of DOC_TYPES) {
      expect(DOC_TYPE_PREFIX[t]).toBe(t);
      expect(DOC_TYPE_LABEL[t]).toMatch(/單$/);
    }
    expect(DOC_TYPE_LABEL.Q).toBe("報價單");
    expect(DOC_TYPE_LABEL.S).toBe("銷貨單");
    expect(DOC_TYPE_LABEL.A).toBe("盤點調整單");
  });
});
