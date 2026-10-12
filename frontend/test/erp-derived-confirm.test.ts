import { describe, expect, it } from "vitest";
import {
  reconvertConfirmOptions,
  returnConfirmOptions,
  type DerivedDocInput,
} from "@/lib/erp/derived-confirm";

// #234：報價「轉銷貨單」／銷貨「建立銷退單」確認框，依已轉出的單據產生內容（純函式）。

function doc(
  id: string,
  status: DerivedDocInput["status"],
  doc_no: string | null,
  created_at = "2026-10-11T16:30:00Z", // 台北 2026-10-12 00:30
): DerivedDocInput {
  return { id, status, doc_no, created_at };
}

describe("reconvertConfirmOptions（報價 → 銷貨）", () => {
  it("沒有轉出單據：維持原本文字與行為", () => {
    expect(reconvertConfirmOptions([])).toEqual({
      title: "將此報價單複製為銷貨單草稿？",
      confirmLabel: "轉銷貨單",
      docs: [],
    });
  });

  it("1 張草稿：警示語氣、列出「草稿＋建立日期（台北時區）」", () => {
    const c = reconvertConfirmOptions([doc("a", "draft", null)]);
    expect(c.tone).toBe("danger");
    expect(c.confirmLabel).toBe("仍要轉銷貨單");
    expect(c.title).toBe("此報價已轉出 1 張銷貨單，仍要再轉一次？");
    expect(c.message).toContain("再轉一次可能重複出貨");
    expect(c.docs).toEqual([
      {
        id: "a",
        label: "草稿（建立於 民國115/10/12）",
        status: "draft",
        voided: false,
      },
    ]);
  });

  it("多張含已過帳：計數含草稿與已過帳，順序沿用（新→舊）", () => {
    const c = reconvertConfirmOptions([
      doc("a", "draft", null),
      doc("b", "posted", "S115100001"),
    ]);
    expect(c.tone).toBe("danger");
    expect(c.title).toBe("此報價已轉出 2 張銷貨單，仍要再轉一次？");
    expect(c.docs.map((d) => [d.label, d.status])).toEqual([
      ["草稿（建立於 民國115/10/12）", "draft"],
      ["S115100001", "posted"],
    ]);
  });

  it("全部作廢：列出但不用警示語氣，確認鈕維持「轉銷貨單」", () => {
    const c = reconvertConfirmOptions([
      doc("a", "voided", "S115100002"),
      doc("b", "voided", "S115100001"),
    ]);
    expect(c.tone).toBeUndefined();
    expect(c.title).toBe("將此報價單複製為銷貨單草稿？");
    expect(c.confirmLabel).toBe("轉銷貨單");
    expect(c.message).toBe("先前轉出的 2 張銷貨單皆已作廢：");
    expect(c.docs.every((d) => d.voided)).toBe(true);
    expect(c.docs.map((d) => d.label)).toEqual(["S115100002", "S115100001"]);
  });

  it("混合：作廢不計入張數、排在最後並標示", () => {
    const c = reconvertConfirmOptions([
      doc("v", "voided", "S115100003"),
      doc("p", "posted", "S115100002"),
      doc("d", "draft", null),
    ]);
    expect(c.tone).toBe("danger");
    expect(c.confirmLabel).toBe("仍要轉銷貨單");
    expect(c.title).toBe("此報價已轉出 2 張銷貨單，仍要再轉一次？");
    expect(c.message).toContain("另有 1 張已作廢");
    expect(c.docs.map((d) => [d.id, d.voided])).toEqual([
      ["p", false],
      ["d", false],
      ["v", true],
    ]);
  });

  it("草稿建立時間無效時仍顯示「草稿」", () => {
    const c = reconvertConfirmOptions([doc("a", "draft", null, "bad")]);
    expect(c.docs[0].label).toBe("草稿");
  });
});

describe("returnConfirmOptions（銷貨 → 銷退）", () => {
  it("沒有銷退單：維持原本文字", () => {
    expect(returnConfirmOptions([])).toEqual({
      title: "從此銷貨單建立銷退單草稿？",
      confirmLabel: "建立銷退單",
      docs: [],
    });
  });

  it("有未過帳的銷退草稿：警示（草稿不扣可退數量，可能重複退貨）", () => {
    const c = returnConfirmOptions([
      doc("p", "posted", "R115100001"),
      doc("d", "draft", null),
    ]);
    expect(c.tone).toBe("danger");
    expect(c.confirmLabel).toBe("仍要建立銷退單");
    expect(c.title).toBe("此銷貨單已有 1 張銷退草稿未過帳，仍要再建立？");
    expect(c.message).toContain("重複退貨");
    expect(c.docs.map((d) => d.id)).toEqual(["p", "d"]);
  });

  it("只有已過帳／作廢的銷退單：僅列出，不警示（已退數量會自動扣除）", () => {
    const c = returnConfirmOptions([
      doc("v", "voided", "R115100002"),
      doc("p", "posted", "R115100001"),
    ]);
    expect(c.tone).toBeUndefined();
    expect(c.title).toBe("從此銷貨單建立銷退單草稿？");
    expect(c.confirmLabel).toBe("建立銷退單");
    expect(c.message).toContain("已過帳的退貨數量會自動扣除");
    expect(c.docs.map((d) => [d.id, d.voided])).toEqual([
      ["p", false],
      ["v", true],
    ]);
  });
});
