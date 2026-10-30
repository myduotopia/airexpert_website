// 報告單結案 → 保養卡一列的欄位對應（#280）— 純函式（client / server 皆可用、可單元測試）。
//
// 實際寫入在 DB：supabase/migrations/0041_service_report_card_sync.sql 的 sr_card_sync_apply
// （結案、作廢、已結案再編輯時由 sr_reports 觸發器在同一交易內對帳）。本檔是同規則的 TS 版，
// 只用來在詳情頁預覽「結案時會寫進保養卡的內容」。兩邊規則改動需同步（SQL 測試與本檔單元測試用同一組範例）。
//
// 規則摘要：
//   · 日期 ← 維護日期；時數 ← 空壓機卡：運轉時數／過濾卡：乾燥機總時數；維護員 ← 主技師姓名；
//   · 服務類型 ← 服務項目，優先順序 定期大/小保養 → 保養 ＞ 查修 → 維修 ＞ 新機試車／例檢 → 例檢；只有「其他」→ 待判定；
//   · 料件（只看品名與數量都有填的列；含「工資」者略過）：
//       空壓機卡依品名關鍵字分到 專用油／機油濾清器／空氣濾清器／油氣分離器／變頻器／過濾系統，
//       過濾卡依「與該卡耗材欄名相同」對應；沒有明確對應的記入備註「其他料件」；
//       同一格一個料件填數量，多個料件填「品名×數量」以「、」串接；
//   · 備註 ← 修護記要及建議 ＋ 其他料件 ＋「維護報告單 <派工單號>」。
import type { MxCardType } from "@/lib/admin/maintenance-normalize";
import type { ServiceType } from "@/lib/admin/maintenance-service-type";
import type { ServiceItem, ServiceReport } from "./types";

/** 空壓機卡的料件欄位。 */
export type CompressorCardColumn =
  | "oil"
  | "oil_filter"
  | "air_filter"
  | "oil_separator"
  | "inverter"
  | "filter_system";

export const COMPRESSOR_CARD_COLUMN_LABELS: Record<
  CompressorCardColumn,
  string
> = {
  oil: "專用油",
  oil_filter: "機油濾清器",
  air_filter: "空氣濾清器",
  oil_separator: "油氣分離器",
  inverter: "變頻器",
  filter_system: "過濾系統",
};

/** 品名比對用：去所有空白（含全形空白）、小寫（同 SQL sr_card_key）。 */
export function cardKey(text: string | null | undefined): string {
  return (text ?? "").replace(/[\s　]+/g, "").toLowerCase();
}

/**
 * 空壓機卡：品名 → 欄位（同 SQL sr_card_part_column）。
 * "skip"＝工資（不是料件）；null＝沒有明確對應（記入備註）。順序即優先順序。
 */
export function cardPartColumn(
  name: string | null | undefined,
): CompressorCardColumn | "skip" | null {
  const k = cardKey(name);
  const has = (...words: string[]) => words.some((w) => k.includes(w));
  if (has("工資")) return "skip";
  if (has("油氣分離")) return "oil_separator";
  if (has("機油濾", "油濾")) return "oil_filter";
  if (has("空氣濾", "空濾")) return "air_filter";
  if (has("變頻")) return "inverter";
  if (has("過濾", "濾蕊", "濾芯")) return "filter_system";
  if (has("專用油", "潤滑油", "機油", "螺旋油")) return "oil";
  return null;
}

/** 服務項目 → 保養卡服務類型（同 SQL）。 */
export function cardServiceType(
  items: readonly ServiceItem[] | null | undefined,
): ServiceType | null {
  const list = items ?? [];
  if (list.includes("periodic")) return "maintenance";
  if (list.includes("repair")) return "repair";
  if (list.includes("new_trial") || list.includes("routine")) {
    return "inspection";
  }
  return null;
}

interface CardPart {
  name: string;
  qty: string;
}

/** 一格的值：一個料件 → 數量；多個 → 「品名×數量」以「、」串接（同 SQL sr_card_cell）。 */
export function cardCell(
  parts: readonly CardPart[] | undefined,
): string | null {
  if (!parts || parts.length === 0) return null;
  if (parts.length === 1) return parts[0].qty;
  return parts.map((p) => `${p.name}×${p.qty}`).join("、");
}

/** 保養卡上的一列（只列同步會寫的欄位）。 */
export interface CardRecordPreview {
  machine_id: string;
  service_date: string;
  hours: string | null;
  technician: string | null;
  service_type: ServiceType | null;
  oil: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  oil_separator: string | null;
  inverter: string | null;
  filter_system: string | null;
  /** 過濾卡：{ 欄 id: 值 }；空壓機卡為 null。 */
  values: Record<string, string> | null;
  note: string | null;
}

export type CardSyncReport = Pick<
  ServiceReport,
  | "report_no"
  | "report_date"
  | "machine_id"
  | "service_items"
  | "summary"
  | "results"
  | "parts"
  | "technician"
>;

export interface CardSyncTarget {
  card_type: MxCardType;
  /** 過濾卡的耗材欄（空壓機卡可省略）。 */
  columns?: readonly { id: string; label: string }[];
}

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 報告單 → 保養卡一列。沒有機台回 null（不同步）。
 * 狀態判斷（只有已結案才寫、作廢刪除）在 DB 端，這裡只算「會寫成什麼」。
 */
export function mapReportToCardRecord(
  report: CardSyncReport,
  target: CardSyncTarget,
): CardRecordPreview | null {
  if (!report.machine_id) return null;
  const isFilter = target.card_type === "filter";
  const columns = target.columns ?? [];

  const byColumn = new Map<CompressorCardColumn, CardPart[]>();
  const byValueId = new Map<string, CardPart[]>();
  const other: CardPart[] = [];

  for (const p of Array.isArray(report.parts) ? report.parts : []) {
    if (!p || typeof p !== "object") continue;
    const name = trimmed(p.name);
    const qty = trimmed(p.qty);
    if (name === "" || qty === "") continue;
    const col = cardPartColumn(name);
    if (col === "skip") continue;
    const part = { name, qty };

    if (isFilter) {
      const key = cardKey(name);
      const hit = columns.find((c) => cardKey(c.label) === key);
      if (hit) byValueId.set(hit.id, [...(byValueId.get(hit.id) ?? []), part]);
      else other.push(part);
    } else if (col) {
      byColumn.set(col, [...(byColumn.get(col) ?? []), part]);
    } else {
      other.push(part);
    }
  }

  const results = report.results ?? {};
  const hours = trimmed(
    isFilter ? results.dryer?.total_hours : results.compressor?.run_hours,
  );

  const noteLines = [
    trimmed(report.summary),
    other.length > 0
      ? `其他料件：${other.map((p) => `${p.name}×${p.qty}`).join("、")}`
      : "",
    `維護報告單 ${report.report_no}`,
  ].filter((l) => l !== "");

  let values: Record<string, string> | null = null;
  if (isFilter) {
    values = {};
    for (const [id, parts] of byValueId) values[id] = cardCell(parts) ?? "";
  }

  const cell = (c: CompressorCardColumn) => cardCell(byColumn.get(c));
  return {
    machine_id: report.machine_id,
    service_date: report.report_date,
    hours: hours === "" ? null : hours,
    technician: trimmed(report.technician) || null,
    service_type: cardServiceType(report.service_items),
    oil: cell("oil"),
    oil_filter: cell("oil_filter"),
    air_filter: cell("air_filter"),
    oil_separator: cell("oil_separator"),
    inverter: cell("inverter"),
    filter_system: cell("filter_system"),
    values,
    note: noteLines.length > 0 ? noteLines.join("\n") : null,
  };
}
