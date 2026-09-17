import { describe, it, expect } from "vitest";
import { srErrorMessage } from "@/lib/service-report/errors";

describe("srErrorMessage", () => {
  it("對應常見錯誤", () => {
    expect(srErrorMessage({ code: "23505", message: "dup" })).toBe(
      "派工單號已存在",
    );
    expect(srErrorMessage({ code: "23503", message: "fk" })).toBe(
      "所選客戶或機台已不存在，請重新選擇",
    );
    expect(srErrorMessage({ code: "42501", message: "rls" })).toBe(
      "沒有機台維護報告單權限",
    );
    expect(
      srErrorMessage({
        code: "P0001",
        message: "voided",
        details: "報告單已作廢，不可修改",
      }),
    ).toBe("報告單已作廢，不可修改");
    // DB 觸發器以 P0001 'validation' + detail 拒絕 → 直接顯示中文 detail。
    expect(
      srErrorMessage({
        code: "P0001",
        message: "validation",
        details: "已列印的報告單不可改派工單號",
      }),
    ).toBe("已列印的報告單不可改派工單號");
    expect(srErrorMessage({ code: "XX000", message: "boom" })).toBe(
      "操作失敗：boom",
    );
    expect(srErrorMessage(null)).toBe("操作失敗");
  });
});
