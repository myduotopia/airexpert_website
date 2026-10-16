import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gateSubmit } from "@/lib/erp/submit-gate";

// #254（A-4 維持原本做法）：「儲存並過帳」／明細頁「過帳」先跳確認框，按確認後才做前端檢核；
// 檢核錯誤仍一次列出（#240）。儲存草稿不跳確認框、直接檢核。

function setup({
  confirmed,
  errors,
}: {
  confirmed: boolean;
  errors: string[];
}) {
  const calls: string[] = [];
  const confirm = async () => {
    calls.push("confirm");
    return confirmed;
  };
  const check = () => {
    calls.push("check");
    return errors;
  };
  return { calls, confirm, check };
}

describe("gateSubmit（先確認、後檢核）", () => {
  it("有錯也先跳確認框；按確認後才檢核，並一次回傳所有錯誤", async () => {
    const { calls, confirm, check } = setup({
      confirmed: true,
      errors: ["請選擇出庫倉。", "第 1 行請選擇品項。"],
    });
    const gate = await gateSubmit({ confirm, check });
    expect(calls).toEqual(["confirm", "check"]);
    expect(gate).toEqual({
      kind: "invalid",
      errors: ["請選擇出庫倉。", "第 1 行請選擇品項。"],
    });
  });

  it("取消確認框 → 不檢核、不顯示錯誤", async () => {
    const { calls, confirm, check } = setup({
      confirmed: false,
      errors: ["請選擇出庫倉。"],
    });
    expect(await gateSubmit({ confirm, check })).toEqual({
      kind: "cancelled",
    });
    expect(calls).toEqual(["confirm"]);
  });

  it("確認後檢核通過 → ok", async () => {
    const { calls, confirm, check } = setup({ confirmed: true, errors: [] });
    expect(await gateSubmit({ confirm, check })).toEqual({ kind: "ok" });
    expect(calls).toEqual(["confirm", "check"]);
  });

  it("不需確認（儲存草稿）→ 直接檢核，有錯照樣列出", async () => {
    const { calls, check } = setup({
      confirmed: true,
      errors: ["請選擇客戶。"],
    });
    expect(await gateSubmit({ confirm: null, check })).toEqual({
      kind: "invalid",
      errors: ["請選擇客戶。"],
    });
    expect(await gateSubmit({ check })).toEqual({
      kind: "invalid",
      errors: ["請選擇客戶。"],
    });
    expect(calls).toEqual(["check", "check"]);
  });

  it("回傳的錯誤是複本，不與檢核結果共用陣列", async () => {
    const source = ["請選擇廠商。"];
    const gate = await gateSubmit({ check: () => source });
    expect(gate.kind === "invalid" && gate.errors).not.toBe(source);
  });
});

// 三個表單／動作列確實走 gateSubmit，且確認框在檢核之前（靜態掃描，防止又改回「有錯不跳確認框」）。
describe("儲存並過帳／過帳的接線（#254）", () => {
  const ERP = join(__dirname, "..", "src/app/admin/(protected)/erp");
  const read = (rel: string) => readFileSync(join(ERP, rel), "utf8");

  it.each([
    "sales/_components/SalesDocForm.tsx",
    "purchases/_components/DocumentForm.tsx",
  ])("%s：askConfirm 放在 gateSubmit 的 confirm，檢核在其後", (rel) => {
    const src = read(rel);
    const gateAt = src.indexOf("await gateSubmit({");
    const confirmAt = src.indexOf("askConfirm(", gateAt);
    const postCheckAt = src.indexOf("collectPostErrors(doc");
    expect(gateAt).toBeGreaterThan(-1);
    expect(src.indexOf("askConfirm(")).toBe(confirmAt);
    expect(confirmAt).toBeGreaterThan(gateAt);
    expect(postCheckAt).toBeGreaterThan(confirmAt);
  });

  it("SalesDocActions：按過帳不先以 postErrors 攔下，改在確認後檢核", () => {
    const src = read("sales/_components/SalesDocActions.tsx");
    expect(src).not.toMatch(/postErrors\.length/);
    expect(src).toMatch(/\(\)\s*=>\s*postErrors,?\s*\)/);
    expect(src).toMatch(/confirm:\s*confirm\s*\?\s*\(\)\s*=>\s*askConfirm/);
  });
});
