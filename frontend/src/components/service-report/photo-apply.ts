// 拍照辨識結果 → 既有回填表單的初始狀態（#280）— 純函式（可單元測試）。
// 編輯頁以結果重新掛載 ReportForm（initial＝本函式的輸出），使用者在原本的表單上檢查、修改後照常儲存。
//
// 合併規則（照片＝現場實際結果，但「沒辨識到」不清掉既有內容）：
//   · 有辨識到的欄位覆蓋：維護日期、時段、狀態、服務項目、修護記要、空壓機／乾燥機檢查（逐欄）、過濾耗材、
//     建議事項、客戶簽名；料件依品名比對填數量（同保養階段套用的比對規則），比不到的填入空白列。
//   · 維護人員：報告單還沒有維護人員 → 依姓名對到員工主檔就選該員工，對不到只填姓名；
//     已有且姓名不同 → 不自動更換，只提示（避免把派工時指定的人換掉、打亂工時比例）。
//     第 2 位以後的姓名對到員工主檔且尚未在單上 → 加為協同技師（比例重新平均）。
//   · 派工單號不動（已列印的單號不可改）；與照片不同由呼叫端警告。
import type { EmployeeOption } from "@/lib/employees/types";
import { applyStageToParts } from "@/lib/service-report/plan/stage";
import type {
  LowConfidenceField,
  ReportPhotoExtraction,
} from "@/lib/service-report/photo-extract";
import { LOW_CONFIDENCE_FIELD_LABELS } from "@/lib/service-report/photo-extract";
import {
  addCoTechnician,
  updateCoTechnician,
} from "@/lib/service-report/technicians";
import type { ServiceReportResults } from "@/lib/service-report/types";
import type { ReportFormState } from "./form-state";

export interface PhotoApplyResult {
  state: ReportFormState;
  /** 帶入（有變動）的欄位名稱，供畫面列出「已帶入」。 */
  filled: string[];
  /** 需要人工注意的提示（未自動處理的維護人員、放不下的料件…）。 */
  notices: string[];
  /** 模型標示為低信心的欄位名稱。 */
  lowConfidence: string[];
}

/** 姓名比對：去空白、小寫。 */
function nameKey(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s　]+/g, "").toLowerCase();
}

function findEmployee(
  employees: readonly EmployeeOption[],
  name: string,
): EmployeeOption | null {
  const key = nameKey(name);
  if (key === "") return null;
  const hits = employees.filter((e) => nameKey(e.name) === key);
  // 同名多人 → 不猜。
  return hits.length === 1 ? hits[0] : null;
}

function mergeResults(
  current: ServiceReportResults,
  next: ServiceReportResults,
): ServiceReportResults {
  const out: ServiceReportResults = { ...current };
  if (next.compressor) {
    out.compressor = { ...current.compressor, ...next.compressor };
  }
  if (next.dryer) out.dryer = { ...current.dryer, ...next.dryer };
  if (next.filter_consumable) out.filter_consumable = next.filter_consumable;
  return out;
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** 把辨識結果帶入表單狀態（不改派工單號、客戶與機台）。 */
export function applyPhotoExtraction(
  state: ReportFormState,
  extraction: ReportPhotoExtraction,
  employees: readonly EmployeeOption[] = [],
): PhotoApplyResult {
  let next: ReportFormState = { ...state };
  const filled: string[] = [];
  const notices: string[] = [];

  if (extraction.report_date && extraction.report_date !== state.report_date) {
    next.report_date = extraction.report_date;
    filled.push("維護日期");
  }
  if (extraction.time_slot && extraction.time_slot !== state.time_slot) {
    next.time_slot = extraction.time_slot;
    filled.push("時段");
  }
  if (
    extraction.machine_state &&
    extraction.machine_state !== state.machine_state
  ) {
    next.machine_state = extraction.machine_state;
    filled.push("狀態");
  }
  if (
    extraction.service_items.length > 0 &&
    !sameList(extraction.service_items, state.service_items)
  ) {
    next.service_items = [...extraction.service_items];
    filled.push("服務項目");
  }
  if (extraction.summary && extraction.summary !== state.summary) {
    next.summary = extraction.summary;
    filled.push("修護記要及建議");
  }

  const results = mergeResults(state.results, extraction.results);
  if (JSON.stringify(results) !== JSON.stringify(state.results)) {
    next.results = results;
    if (extraction.results.compressor) filled.push("空壓機檢查");
    if (extraction.results.dryer) filled.push("乾燥機檢查");
    if (extraction.results.filter_consumable) filled.push("過濾耗材");
  }

  if (extraction.parts.length > 0) {
    const { parts, overflow } = applyStageToParts(
      state.parts,
      { parts: extraction.parts.filter((p) => p.name !== "") },
      { overwrite: true },
    );
    if (JSON.stringify(parts) !== JSON.stringify(state.parts)) {
      next.parts = parts;
      filled.push("更換料件");
    }
    const unnamed = extraction.parts.filter((p) => p.name === "");
    if (overflow.length > 0) {
      notices.push(
        `更換料件超過 10 列，以下未帶入，請手動調整：${overflow
          .map((p) => `${p.name}×${p.qty}`)
          .join("、")}`,
      );
    }
    if (unnamed.length > 0) {
      notices.push(
        `照片上有未寫品名的料件數量（${unnamed.map((p) => p.qty).join("、")}），未帶入，請手動補上品名。`,
      );
    }
  }

  if (
    extraction.suggestions.length > 0 &&
    !sameList(extraction.suggestions, state.suggestions)
  ) {
    next.suggestions = [...extraction.suggestions];
    filled.push("建議事項");
  }
  if (
    extraction.customer_signer &&
    extraction.customer_signer !== state.customer_signer
  ) {
    next.customer_signer = extraction.customer_signer;
    filled.push("客戶簽名");
  }

  // ── 維護人員
  const [primaryName, ...others] = extraction.technicians;
  if (primaryName) {
    const current = state.technician.trim();
    if (current === "") {
      const emp = findEmployee(employees, primaryName);
      next.technician = emp ? emp.name : primaryName;
      next.technician_id = emp ? emp.id : null;
      filled.push("維護人員");
      if (!emp) {
        notices.push(
          `維護人員「${primaryName}」未對應到員工主檔，已只填姓名；需記錄工時比例請從選單選擇員工。`,
        );
      }
    } else if (nameKey(current) !== nameKey(primaryName)) {
      notices.push(
        `照片上的維護人員為「${primaryName}」，與報告單的「${current}」不同，未自動更換，請確認。`,
      );
    }
  }
  for (const name of others) {
    const emp = findEmployee(employees, name);
    const onSheet =
      nameKey(next.technician) === nameKey(name) ||
      next.co_technicians.some((c) => nameKey(c.name) === nameKey(name));
    if (onSheet) continue;
    if (!emp || emp.id === next.technician_id) {
      notices.push(
        `照片上的維護人員「${name}」未帶入，請視需要手動加為協同技師。`,
      );
      continue;
    }
    const before = next.co_technicians.length;
    const added = addCoTechnician(next);
    if (added.co_technicians.length === before) {
      notices.push(`協同技師已達上限，「${name}」未帶入。`);
      continue;
    }
    next = updateCoTechnician(added, before, { id: emp.id, name: emp.name });
    if (!filled.includes("協同技師")) filled.push("協同技師");
  }

  const lowConfidence = extraction.low_confidence.map(
    (k: LowConfidenceField) => LOW_CONFIDENCE_FIELD_LABELS[k],
  );

  return { state: next, filled, notices, lowConfidence };
}
