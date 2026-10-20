import { describe, it, expect } from "vitest";

// 員工敏感資料（#257）純邏輯：遮罩（與 DB hr_mask_private 同一組案例，見 supabase/tests/employee_hr_test.sql §3）、
// 顯示文字、編輯表單 → upsert 語意、RPC 錯誤訊息、顯示明文的倒數與到期恢復遮罩。全部虛構資料。
import {
  REVEAL_SECONDS,
  addReveal,
  buildPrivatePatch,
  hrRpcError,
  HR_FORBIDDEN_MESSAGE,
  HR_KEY_MISSING_MESSAGE,
  HR_DECRYPT_FAILED_MESSAGE,
  maskPrivateValue,
  privateDisplay,
  privatePatchError,
  pruneReveals,
  revealSecondsLeft,
  toPrivateView,
} from "@/lib/employees/private";

describe("maskPrivateValue（與 SQL hr_mask_private 一致）", () => {
  it.each([
    ["national_id", "Z999999999", "Z99*****99"],
    ["national_id", " z900 000019 ", "Z90*****19"],
    ["national_id", "AB123", "A****"],
    ["national_id", "AB", "**"],
    ["household_address", "臺北市測試區虛構路1號", "臺北市測試區…"],
    ["household_address", "100 臺北市測試區虛構路1號", "臺北市測試區…"],
    ["household_address", "新竹縣測試市虛構里", "新竹縣測試市…"],
    ["household_address", "虛構縣", "虛構縣…"],
    ["household_address", "Fake Street 1", "已填寫"],
    ["emergency_contact", "測試聯絡人 Z999999999", "已填寫（16 字）"],
    ["marital", "未婚", "已填寫"],
    ["education", "虛構大學測試系", "虛構大…"],
    ["experience", "虛構公司測試工程師十年", "虛構公司…"],
    ["education", "甲", "…"],
  ] as const)("%s：%s → %s", (field, value, masked) => {
    expect(maskPrivateValue(field, value)).toBe(masked);
  });

  it("空值 → null；顯示為「未填寫」", () => {
    expect(maskPrivateValue("education", "   ")).toBeNull();
    expect(maskPrivateValue("marital", null)).toBeNull();
    expect(privateDisplay(null)).toBe("未填寫");
    expect(privateDisplay("Z99*****99")).toBe("Z99*****99");
  });

  it("遮罩結果不含身份證號中段", () => {
    expect(maskPrivateValue("national_id", "Z900000019")).not.toContain("0000");
  });
});

describe("toPrivateView", () => {
  it("RPC 回傳 → 6 欄（缺漏與非字串視為未填寫）", () => {
    const v = toPrivateView({
      employee_id: "e1",
      exists: true,
      updated_at: "2026-10-21T00:00:00Z",
      fields: { national_id: "Z99*****99", marital: 1 },
    })!;
    expect(v.fields).toEqual({
      national_id: "Z99*****99",
      household_address: null,
      emergency_contact: null,
      marital: null,
      education: null,
      experience: null,
    });
    expect(v.exists).toBe(true);
    expect(toPrivateView(null)).toBeNull();
  });
});

describe("buildPrivatePatch（hr_upsert 語意）", () => {
  it("留白 = 不送（不變）；清除 = null；有輸入 = 去頭尾空白", () => {
    expect(
      buildPrivatePatch(
        { national_id: " Z999999999 ", marital: "   ", education: "虛構大學" },
        ["education", "experience"],
      ),
    ).toEqual({ national_id: "Z999999999", education: null, experience: null });
    expect(buildPrivatePatch({})).toEqual({});
  });

  it("長度檢查（與 DB 上限一致）", () => {
    expect(privatePatchError({ national_id: "Z".repeat(21) })).toBe(
      "身份證號不可超過 20 字。",
    );
    expect(
      privatePatchError({ national_id: "Z".repeat(20), education: null }),
    ).toBeNull();
  });
});

describe("hrRpcError", () => {
  it("RPC 錯誤代碼 → 中文訊息", () => {
    expect(hrRpcError({ message: "forbidden" })).toBe(HR_FORBIDDEN_MESSAGE);
    expect(hrRpcError({ code: "42501", message: "permission denied" })).toBe(
      HR_FORBIDDEN_MESSAGE,
    );
    expect(hrRpcError({ message: "hr_key_missing" })).toBe(
      HR_KEY_MISSING_MESSAGE,
    );
    expect(hrRpcError({ message: "hr_decrypt_failed" })).toBe(
      HR_DECRYPT_FAILED_MESSAGE,
    );
    expect(
      hrRpcError({ message: "validation", details: "敏感欄位 x 需為文字" }),
    ).toBe("敏感欄位 x 需為文字");
    expect(hrRpcError({ message: "boom" })).toBe("操作失敗：boom");
  });
});

describe("顯示明文的倒數與恢復遮罩", () => {
  it(`${REVEAL_SECONDS} 秒後到期移除；未到期不變（同一物件）`, () => {
    const t0 = 1_000_000;
    let s = addReveal({}, "national_id", "Z999999999", t0);
    s = addReveal(s, "marital", "未婚", t0 + 10_000);
    expect(revealSecondsLeft(s, "national_id", t0 + 500)).toBe(REVEAL_SECONDS);
    expect(pruneReveals(s, t0 + 1000)).toBe(s);
    const later = pruneReveals(s, t0 + REVEAL_SECONDS * 1000);
    expect(later.national_id).toBeUndefined();
    expect(later.marital?.value).toBe("未婚");
    expect(revealSecondsLeft(later, "national_id", t0)).toBe(0);
    expect(pruneReveals(later, t0 + 10_000 + REVEAL_SECONDS * 1000)).toEqual(
      {},
    );
  });
});
