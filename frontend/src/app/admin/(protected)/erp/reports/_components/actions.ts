"use server";

// 報表 CSV 匯出（spec §8）：server action 回傳 CSV 字串（UTF-8 BOM），client 以 Blob 下載。
// 每個 action 開頭 ensureErp（layout 不保護 server action）；回傳 { ok, error }，不 throw。
import { ensureErp } from "@/lib/erp/guard";
import {
  getAgingReport,
  getSalesMarginReport,
} from "@/lib/erp/queries/reports";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABEL,
  SALES_GROUP_BY,
  percentValue,
  toCsv,
  type SalesGroupBy,
} from "@/lib/erp/reports";
import { isIsoDate } from "@/lib/erp/statement";
import type { ErpResult } from "@/lib/erp/types";

export interface ReportCsvInput {
  tab: "margin" | "ar" | "ap";
  from?: string;
  to?: string;
  group?: SalesGroupBy;
  asOf?: string;
}

const GROUP_HEADER: Record<SalesGroupBy, string[]> = {
  customer: ["客戶編號", "客戶名稱"],
  item: ["品項代碼", "品名", "單位"],
  sales_rep: ["業務"],
};
const GROUP_FILE: Record<SalesGroupBy, string> = {
  customer: "客戶",
  item: "品項",
  sales_rep: "業務",
};

export async function exportReportCsvAction(
  input: ReportCsvInput,
): Promise<ErpResult<{ filename: string; csv: string }>> {
  const denied = await ensureErp();
  if (denied) return denied;

  if (input.tab === "margin") {
    const group = input.group;
    if (!group || !SALES_GROUP_BY.includes(group)) {
      return { ok: false, error: "彙總方式不正確。" };
    }
    if (!isIsoDate(input.from) || !isIsoDate(input.to)) {
      return { ok: false, error: "請填寫完整的起訖日期。" };
    }
    const res = await getSalesMarginReport({
      from: input.from,
      to: input.to,
      groupBy: group,
    });
    if (!res.ok) return res;
    const labelCells = (r: {
      code: string | null;
      label: string;
      unit: string | null;
    }) =>
      group === "customer"
        ? [r.code, r.label]
        : group === "item"
          ? [r.code, r.label, r.unit]
          : [r.label];
    const header = [
      ...GROUP_HEADER[group],
      "數量",
      "未稅銷售額(TWD)",
      "成本(TWD)",
      "毛利(TWD)",
      "毛利率(%)",
    ];
    const rows = res.data.rows.map((r) => [
      ...labelCells(r),
      r.qty,
      r.revenue,
      r.cost,
      r.margin,
      percentValue(r.marginRate),
    ]);
    const t = res.data.totals;
    rows.push([
      "合計",
      ...GROUP_HEADER[group].slice(1).map(() => ""),
      t.qty,
      t.revenue,
      t.cost,
      t.margin,
      percentValue(t.marginRate),
    ]);
    return {
      ok: true,
      data: {
        filename: `銷售毛利_${GROUP_FILE[group]}_${input.from}_${input.to}.csv`,
        csv: toCsv(header, rows),
      },
    };
  }

  if (input.tab === "ar" || input.tab === "ap") {
    if (!isIsoDate(input.asOf)) {
      return { ok: false, error: "請填寫完整的基準日。" };
    }
    const isAr = input.tab === "ar";
    const res = await getAgingReport({
      partyType: isAr ? "customer" : "vendor",
      asOf: input.asOf,
    });
    if (!res.ok) return res;
    const header = [
      isAr ? "客戶編號" : "廠商編號",
      isAr ? "客戶名稱" : "廠商名稱",
      ...AGING_BUCKETS.map((b) => AGING_BUCKET_LABEL[b]),
      isAr ? "應收合計" : "應付合計",
      isAr ? "預收" : "預付",
      "淨額",
    ];
    const rows = res.data.rows.map((r) => [
      r.code,
      r.name,
      ...AGING_BUCKETS.map((b) => r.buckets[b]),
      r.outstanding,
      r.unallocated,
      r.net,
    ]);
    const t = res.data.totals;
    rows.push([
      "合計",
      "",
      ...AGING_BUCKETS.map((b) => t.buckets[b]),
      t.outstanding,
      t.unallocated,
      t.net,
    ]);
    return {
      ok: true,
      data: {
        filename: `${isAr ? "應收帳齡" : "應付總表"}_${input.asOf}.csv`,
        csv: toCsv(header, rows),
      },
    };
  }

  return { ok: false, error: "報表類型不正確。" };
}
