import { describe, it, expect } from "vitest";
import {
  ERP_ERROR_MESSAGES,
  ERP_FORBIDDEN_MESSAGE,
  erpErrorMessage,
  isErpErrorCode,
} from "@/lib/erp/errors";

// RPC 錯誤碼 → 中文（spec §9）。

describe("erpErrorMessage", () => {
  it("有 details（RPC 的人讀訊息）時優先使用", () => {
    expect(
      erpErrorMessage({
        message: "insufficient_stock",
        details: "品項 ALH-15AI 在「總倉」庫存不足（剩 0）",
      }),
    ).toBe("品項 ALH-15AI 在「總倉」庫存不足（剩 0）");
  });

  it("無 details 時以錯誤碼對應中文", () => {
    for (const code of Object.keys(ERP_ERROR_MESSAGES)) {
      expect(erpErrorMessage({ message: code })).toBe(
        ERP_ERROR_MESSAGES[code as keyof typeof ERP_ERROR_MESSAGES],
      );
    }
    expect(erpErrorMessage({ message: "forbidden", details: "  " })).toBe(
      ERP_FORBIDDEN_MESSAGE,
    );
  });

  it("涵蓋 spec 列舉的全部 9 個錯誤碼", () => {
    expect(Object.keys(ERP_ERROR_MESSAGES).sort()).toEqual(
      [
        "forbidden",
        "not_draft",
        "not_posted",
        "validation",
        "insufficient_stock",
        "serial_unavailable",
        "over_receipt",
        "has_dependents",
        "over_allocation",
      ].sort(),
    );
  });

  it("未知錯誤帶出原始訊息", () => {
    expect(
      erpErrorMessage({ message: "permission denied for table erp_items" }),
    ).toBe("操作失敗：permission denied for table erp_items");
  });

  it("空錯誤給通用訊息", () => {
    expect(erpErrorMessage(null)).toBe("操作失敗，請稍後再試。");
    expect(erpErrorMessage({})).toBe("操作失敗，請稍後再試。");
  });

  it("isErpErrorCode 只認列舉值", () => {
    expect(isErpErrorCode("not_draft")).toBe(true);
    expect(isErpErrorCode("toString")).toBe(false);
    expect(isErpErrorCode(undefined)).toBe(false);
  });
});
