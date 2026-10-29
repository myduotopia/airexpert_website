// 維護報告單多技師工時分攤（#271，DB：0037 sr_report_technicians）— 純函式（client / server 皆可用）。
//   · 主技師＝既有「維護人員」（sr_reports.technician / technician_id），另可加入多位「協同技師」；
//     每人一個工時比例（0 < 比例 ≤ 1，最多兩位小數），例如兩人各 0.5。
//   · 預設：只有主技師時為 1；新增或移除協同技師時全部重新平均分配（餘數給排在前面的人），之後可手動修改。
//   · 不強制比例總和為 1（兩人各算一天也合理）；DB 端 sr_set_report_technicians 做相同的檢查。
import { isUuid } from "./validate";

/** 協同技師人數上限（與 DB sr_set_report_technicians 一致）。 */
export const MAX_CO_TECHNICIANS = 10;

/** 表單中的一位協同技師（比例為輸入字串）。 */
export interface CoTechnicianDraft {
  id: string | null;
  name: string;
  share: string;
}

/** 表單中與技師相關的欄位（ReportFormState 的子集合）。 */
export interface TechnicianDraft {
  technician: string;
  technician_id: string | null;
  technician_share: string;
  co_technicians: CoTechnicianDraft[];
}

/** 送給 server action 的協同技師。 */
export interface CoTechnicianInput {
  employee_id: string;
  share: number;
}

/** sr_report_technicians 列（含員工姓名，詳情／編輯頁用）。 */
export interface ReportTechnicianRow {
  employee_id: string;
  name: string;
  code: string | null;
  share: number;
  is_primary: boolean;
  sort_order: number;
}

const SHARE_ERROR = "工時比例須大於 0、不超過 1，最多兩位小數";

/** 比例數字 → 顯示字串（1、0.5、0.33）。 */
export function shareText(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 數字比例是否合法：0 < n ≤ 1、最多兩位小數。 */
export function isValidShare(n: unknown): n is number {
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  if (n <= 0 || n > 1) return false;
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
}

/** 輸入字串 → 比例；不合法回 null。只接受一般小數寫法（不接受 1e-1、0x1、負號）。 */
export function parseShare(s: string): number | null {
  const t = (s ?? "").trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(t)) return null;
  const n = Number(t);
  return isValidShare(n) ? n : null;
}

/** n 人平均分配（以 0.01 為單位，加總剛好 1，餘數給前面的人）。 */
export function evenShares(n: number): string[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  return Array.from({ length: n }, (_, i) =>
    shareText((base + (i < rem ? 1 : 0)) / 100),
  );
}

function rebalance<T extends TechnicianDraft>(
  d: T,
  co: CoTechnicianDraft[],
): T {
  const shares = evenShares(co.length + 1);
  return {
    ...d,
    technician_share: shares[0],
    co_technicians: co.map((c, i) => ({ ...c, share: shares[i + 1] })),
  };
}

/** 新增一位（尚未選人的）協同技師，全部重新平均；已達上限則不變。 */
export function addCoTechnician<T extends TechnicianDraft>(d: T): T {
  if (d.co_technicians.length >= MAX_CO_TECHNICIANS) return d;
  return rebalance(d, [...d.co_technicians, { id: null, name: "", share: "" }]);
}

/** 移除第 index 位協同技師，剩下的人重新平均（全部移除 → 主技師 1）。 */
export function removeCoTechnician<T extends TechnicianDraft>(
  d: T,
  index: number,
): T {
  return rebalance(
    d,
    d.co_technicians.filter((_, i) => i !== index),
  );
}

/** 修改第 index 位協同技師（選人或改比例）。 */
export function updateCoTechnician<T extends TechnicianDraft>(
  d: T,
  index: number,
  patch: Partial<CoTechnicianDraft>,
): T {
  return {
    ...d,
    co_technicians: d.co_technicians.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    ),
  };
}

/** 主技師的員工 id（有姓名且 id 合法才算；舊資料只有文字 → null）。 */
function primaryIdOf(technician: string | null, id: unknown): string | null {
  return (technician ?? "").trim() !== "" && isUuid(id) ? id : null;
}

/** 表單送出前檢查（訊息與 server／DB 一致）。 */
export function validateTechnicianDraft(d: TechnicianDraft): string | null {
  const primaryId = primaryIdOf(d.technician, d.technician_id);
  for (const [i, c] of d.co_technicians.entries()) {
    if (!c.id) return `第 ${i + 1} 位協同技師請從員工清單選擇，或移除該列`;
  }
  if (d.co_technicians.length > 0 && !primaryId) {
    return "有協同技師時，主技師須從員工清單選擇";
  }
  const seen = new Set(primaryId ? [primaryId] : []);
  for (const c of d.co_technicians) {
    if (seen.has(c.id as string)) return "同一位技師不可重複列出";
    seen.add(c.id as string);
  }
  if (primaryId && parseShare(d.technician_share) === null) {
    return `主技師${SHARE_ERROR}`;
  }
  for (const [i, c] of d.co_technicians.entries()) {
    if (parseShare(c.share) === null) {
      return `第 ${i + 1} 位協同技師${SHARE_ERROR}`;
    }
  }
  return null;
}

/** server action 輸入檢查（未帶 co_technicians／technician_share＝不同步技師，通過）。 */
export function validateTechnicianInput(r: {
  technician?: unknown;
  technician_id?: unknown;
  technician_share?: unknown;
  co_technicians?: unknown;
}): string | null {
  if (r.co_technicians === undefined && r.technician_share === undefined) {
    return null;
  }
  const co = r.co_technicians ?? [];
  if (!Array.isArray(co)) return "協同技師格式不正確";
  if (co.length > MAX_CO_TECHNICIANS) {
    return `協同技師最多 ${MAX_CO_TECHNICIANS} 位`;
  }
  for (const [i, c] of co.entries()) {
    if (typeof c !== "object" || c === null || !isUuid(c.employee_id)) {
      return `第 ${i + 1} 位協同技師請從員工清單選擇`;
    }
    if (!isValidShare(c.share)) return `第 ${i + 1} 位協同技師${SHARE_ERROR}`;
  }
  const primaryId = primaryIdOf(
    typeof r.technician === "string" ? r.technician : null,
    r.technician_id,
  );
  if (co.length > 0 && !primaryId) {
    return "有協同技師時，主技師須從員工清單選擇";
  }
  const seen = new Set(primaryId ? [primaryId] : []);
  for (const c of co as CoTechnicianInput[]) {
    if (seen.has(c.employee_id)) return "同一位技師不可重複列出";
    seen.add(c.employee_id);
  }
  if (primaryId && !isValidShare(r.technician_share)) {
    return `主技師${SHARE_ERROR}`;
  }
  return null;
}

/**
 * 通過驗證後：要寫入 sr_set_report_technicians 的內容；未帶 co_technicians → undefined（不同步）。
 * 主技師不是員工主檔（沒有 id）時 primary_share 為 null（DB 端會清空技師列）。
 */
export function normalizeTechnicianInput(r: {
  technician?: string | null;
  technician_id?: string | null;
  technician_share?: number | null;
  co_technicians?: CoTechnicianInput[];
}):
  | { primary_share: number | null; collaborators: CoTechnicianInput[] }
  | undefined {
  if (r.co_technicians === undefined) return undefined;
  const primaryId = primaryIdOf(r.technician ?? null, r.technician_id);
  return {
    primary_share: primaryId ? (r.technician_share ?? null) : null,
    collaborators: r.co_technicians.map((c) => ({
      employee_id: c.employee_id,
      share: c.share,
    })),
  };
}

/** DB 技師列 → 表單（主技師比例＋協同依 sort_order）。沒有技師列 → 主技師 1。 */
export function technicianDraftFromRows(
  rows: readonly ReportTechnicianRow[],
  primaryId: string | null,
): Pick<TechnicianDraft, "technician_share" | "co_technicians"> {
  const primary = rows.find((r) => r.is_primary && r.employee_id === primaryId);
  const co = rows
    .filter((r) => !r.is_primary && r.employee_id !== primaryId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.employee_id,
      name: r.name,
      share: shareText(Number(r.share)),
    }));
  return {
    technician_share: primary ? shareText(Number(primary.share)) : "1",
    co_technicians: co,
  };
}

/** 列印／預覽的「維護人員」：主技師在前，以「、」連接；全空回 null。 */
export function technicianNames(
  primary: string | null | undefined,
  others: readonly string[],
): string | null {
  const names = [primary ?? "", ...others]
    .map((n) => n.trim())
    .filter((n) => n !== "");
  return names.length ? names.join("、") : null;
}
