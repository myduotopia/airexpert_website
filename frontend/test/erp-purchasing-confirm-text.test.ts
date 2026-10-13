import { describe, expect, it } from "vitest";

// #248 N-3：採購區（P / I / PR 共用 DocumentForm、DocActionBar）的過帳與作廢確認框文字依單別。
// 採購單過帳只取號、不異動庫存（進貨單過帳才入庫）；作廢也不回沖庫存。
import {
  purchasingPostConfirmMessage,
  purchasingVoidConfirmMessage,
} from "@/lib/erp/confirm-text";

describe("purchasingPostConfirmMessage", () => {
  it("採購單：取號、不異動庫存（進貨時入庫）", () => {
    expect(purchasingPostConfirmMessage("P")).toBe(
      "過帳後將取號，不異動庫存（進貨時入庫），只能以作廢撤銷。",
    );
  });

  it("進貨單、進退單：取號並異動庫存", () => {
    for (const t of ["I", "PR"] as const) {
      expect(purchasingPostConfirmMessage(t)).toBe(
        "過帳後將取號並異動庫存，只能以作廢撤銷。",
      );
    }
  });
});

describe("purchasingVoidConfirmMessage", () => {
  it("採購單：不提庫存回沖；說明已有進貨單時需先作廢進貨單", () => {
    const msg = purchasingVoidConfirmMessage("P");
    expect(msg).not.toContain("庫存將回沖");
    expect(msg).toBe(
      "採購單未異動庫存，作廢不影響庫存，單號不再使用；已有進貨單引用時需先作廢進貨單。",
    );
  });

  it("進貨單、進退單：庫存將回沖", () => {
    for (const t of ["I", "PR"] as const) {
      expect(purchasingVoidConfirmMessage(t)).toBe(
        "庫存將回沖，單號不再使用。",
      );
    }
  });
});
