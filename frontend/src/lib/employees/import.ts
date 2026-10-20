// 員工匯入（#257）的純邏輯：標題列偵測、欄位對應、職務 → 角色、比對既有員工、在職／離職判定、
// 敏感欄位在非 hr 時丟棄、產生寫入動作。瀏覽器（預覽）、server action（實際寫入前重算）、
// 一次性匯入腳本（frontend/scripts/import-employees.ts）與測試共用；不可 import server-only 模組。
//
// 檔案解析（xls／xlsx／csv → 二維字串陣列）在呼叫端用 SheetJS 完成，本檔只處理「格子」。
import {
  cleanEmployeeName,
  employeeNameKey,
  isIsoDate,
  normalizePhone,
} from "./normalize";
import {
  PRIVATE_FIELDS,
  type PrivateField,
  type PrivateValues,
} from "./private";
import {
  EMPLOYEE_NAME_MAX,
  EMPLOYEE_ROLES,
  EMPLOYEE_SHORT_TEXT_MAX,
  type EmployeeRole,
} from "./types";

/** 一個工作表：列 × 欄的字串（SheetJS sheet_to_json({ header: 1, raw: false, defval: "" })）。 */
export type SheetGrid = readonly (readonly unknown[])[];

/** 匯入目標欄位（basic = employees 非敏感欄位；private = employee_private 加密欄位）。 */
export type BasicTarget =
  | "code"
  | "name"
  | "title"
  | "phone"
  | "hired_on"
  | "left_on";
export type ImportTarget = BasicTarget | PrivateField;

export const BASIC_TARGETS: readonly BasicTarget[] = [
  "code",
  "name",
  "title",
  "phone",
  "hired_on",
  "left_on",
];

export const IMPORT_TARGET_LABELS: Record<ImportTarget, string> = {
  code: "員工編號",
  name: "姓名",
  title: "職務",
  phone: "電話",
  hired_on: "到職日",
  left_on: "離職日",
  national_id: "身份證號（敏感）",
  household_address: "戶籍地址（敏感）",
  emergency_contact: "聯絡人原文（敏感）",
  marital: "婚姻（敏感）",
  education: "學歷（敏感）",
  experience: "經歷（敏感）",
};

export function isPrivateTarget(t: ImportTarget): t is PrivateField {
  return (PRIVATE_FIELDS as readonly string[]).includes(t);
}

/**
 * 預設對應（#257 欄位對應表）：標題文字（去空白後）→ 目標欄位。
 * 「聯絡人」原文可能夾帶證號或電話 → 整段當敏感欄位加密保存；employees.emergency_contact
 * 由 hr 人工整理後填寫，匯入不自動填。
 */
const HEADER_SYNONYMS: Record<string, ImportTarget> = {
  員工編號: "code",
  員工代號: "code",
  編號: "code",
  代號: "code",
  員工名稱: "name",
  員工姓名: "name",
  姓名: "name",
  職務: "title",
  職稱: "title",
  聯絡電話: "phone",
  電話: "phone",
  手機: "phone",
  到職日: "hired_on",
  到職日期: "hired_on",
  離職日: "left_on",
  離職日期: "left_on",
  身份證號: "national_id",
  身分證號: "national_id",
  身份證字號: "national_id",
  身分證字號: "national_id",
  戶籍地址: "household_address",
  聯絡人: "emergency_contact",
  緊急聯絡人: "emergency_contact",
  婚姻: "marital",
  學歷: "education",
  經歷: "experience",
};

/** 格子 → 字串（null／undefined → ""；去頭尾空白）。 */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

function headerKey(v: unknown): string {
  return cellText(v).replace(/[\s　]+/g, "");
}

/** 標題列偵測：前 maxScan 列中，第一個含「員工編號」格子的列（0-based）；找不到 → -1。 */
export function detectHeaderRow(grid: SheetGrid, maxScan = 30): number {
  const n = Math.min(grid.length, maxScan);
  for (let i = 0; i < n; i++) {
    if ((grid[i] ?? []).some((c) => headerKey(c) === "員工編號")) return i;
  }
  return -1;
}

/** 欄位對應：mapping[欄 index] = 目標欄位或 null（不匯入）。 */
export type ColumnMapping = (ImportTarget | null)[];

/** 依標題列產生預設對應；同一目標只對應第一個出現的欄。 */
export function defaultMapping(headers: readonly unknown[]): ColumnMapping {
  const used = new Set<ImportTarget>();
  return headers.map((h) => {
    const t = HEADER_SYNONYMS[headerKey(h)];
    if (!t || used.has(t)) return null;
    used.add(t);
    return t;
  });
}

/** 對應錯誤（必須有姓名欄；同一目標不可對應兩欄）。 */
export function mappingError(mapping: ColumnMapping): string | null {
  const seen = new Set<ImportTarget>();
  for (const t of mapping) {
    if (!t) continue;
    if (seen.has(t)) return `「${IMPORT_TARGET_LABELS[t]}」對應到兩個欄位。`;
    seen.add(t);
  }
  if (!seen.has("name")) return "請指定「姓名」欄。";
  return null;
}

/**
 * 日期格子 → YYYY-MM-DD；空白 → null；無法解析 → undefined。
 * 接受：YYYY-MM-DD、YYYY/M/D、YYYY.M.D、民國年 YYY/M/D（2–3 碼年 + 1911）、Excel 序號（> 20000）。
 */
export function parseDateCell(v: unknown): string | null | undefined {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  }
  const s = cellText(v).normalize("NFKC");
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 20000) {
    // Excel 序號（1900 系統）：25569 = 1970-01-01
    const ms = Math.round((Number(s) - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const m = /^(\d{2,4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(s);
  if (!m) return undefined;
  let y = Number(m[1]);
  if (m[1].length <= 3) y += 1911;
  const iso = `${String(y).padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : undefined;
}

/** 職務 → 角色（#257 第 6 點）：完全比對（去空白）；對不到 → 無角色。 */
const TITLE_ROLES: Record<string, EmployeeRole> = {
  業務: "sales",
  業務人員: "sales",
  服務: "technician",
  內勤: "office",
  會計: "office",
  負責人: "manager",
};

export function titleToRoles(title: string | null | undefined): EmployeeRole[] {
  const key = (title ?? "").replace(/[\s　]+/g, "");
  const role = TITLE_ROLES[key];
  return role ? [role] : [];
}

/** 解析後的一列（尚未比對既有員工）。line = 工作表上的列號（1-based，對照 Excel）。 */
export interface ImportRow {
  line: number;
  code: string | null;
  name: string;
  title: string | null;
  phone: string | null;
  /** undefined = 檔案沒有此欄或無法解析；null = 空白。 */
  hired_on?: string | null;
  left_on?: string | null;
  private: PrivateValues;
  /** 解析時的提醒（例：日期無法解析）。 */
  warnings: string[];
}

/** 依對應把標題列以下的資料轉成 ImportRow（整列空白略過）。 */
export function parseRows(
  grid: SheetGrid,
  headerRow: number,
  mapping: ColumnMapping,
): ImportRow[] {
  const rows: ImportRow[] = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    const get = (t: ImportTarget): string | undefined => {
      const idx = mapping.indexOf(t);
      return idx < 0 ? undefined : cellText(cells[idx]);
    };
    const hasAny = mapping.some((t, idx) => t && cellText(cells[idx]) !== "");
    if (!hasAny) continue;

    const warnings: string[] = [];
    const date = (t: "hired_on" | "left_on", label: string) => {
      const idx = mapping.indexOf(t);
      if (idx < 0) return undefined;
      const parsed = parseDateCell(cells[idx]);
      if (parsed === undefined) {
        warnings.push(`${label}「${cellText(cells[idx])}」無法解析，略過此欄`);
      }
      return parsed;
    };
    const priv: PrivateValues = {};
    for (const f of PRIVATE_FIELDS) {
      const v = get(f);
      if (v) priv[f] = v;
    }
    const row: ImportRow = {
      line: i + 1,
      code: (get("code") ?? "").normalize("NFKC").trim() || null,
      name: cleanEmployeeName(get("name")),
      title: (get("title") ?? "").replace(/\s+/g, " ").trim() || null,
      phone: normalizePhone(get("phone")) || null,
      private: priv,
      warnings,
    };
    const hired = date("hired_on", "到職日");
    const left = date("left_on", "離職日");
    if (hired !== undefined) row.hired_on = hired;
    if (left !== undefined) row.left_on = left;
    rows.push(row);
  }
  return rows;
}

/** 另一張工作表的員工編號與姓名 key（「不在在職表中的設為離職」比對用）。 */
export interface SheetKeys {
  codes: Set<string>;
  names: Set<string>;
}

export function codeKey(code: string | null | undefined): string {
  return (code ?? "").normalize("NFKC").trim().toLowerCase();
}

export function collectSheetKeys(grid: SheetGrid): SheetKeys | null {
  const header = detectHeaderRow(grid);
  if (header < 0) return null;
  const mapping = defaultMapping(grid[header] ?? []);
  const keys: SheetKeys = { codes: new Set(), names: new Set() };
  for (const r of parseRows(grid, header, mapping)) {
    if (r.code) keys.codes.add(codeKey(r.code));
    if (r.name) keys.names.add(employeeNameKey(r.name));
  }
  return keys;
}

/**
 * 在職／離職判定：
 *   keep     — 新增者在職；既有員工狀態不變
 *   active   — 此工作表的員工全部設為在職
 *   inactive — 此工作表的員工全部設為離職（停用）
 *   compare  — 以另一張工作表比對：在該表（編號或姓名）→ 在職，不在 → 離職
 */
export type ImportStatusMode = "keep" | "active" | "inactive" | "compare";

export const IMPORT_STATUS_LABELS: Record<ImportStatusMode, string> = {
  keep: "新增者為在職，既有員工狀態不變",
  active: "此工作表的員工全部設為在職",
  inactive: "此工作表的員工全部設為離職",
  compare: "以另一張工作表比對：不在該表中的設為離職",
};

/** 比對用的既有員工（非敏感欄位）。 */
export interface ExistingEmployee {
  id: string;
  code: string | null;
  name: string;
  roles: EmployeeRole[];
  active: boolean;
  title: string | null;
  phone: string | null;
  hired_on: string | null;
  left_on: string | null;
}

export const IMPORT_EXISTING_COLUMNS =
  "id, code, name, roles, active, title, phone, hired_on, left_on";

export interface PlanOptions {
  status: ImportStatusMode;
  /** status = compare 時的比對表。 */
  compareKeys?: SheetKeys | null;
  /** false → 敏感欄位一律丟棄（不送 server、預覽標示「需要人事權限」）。 */
  canWritePrivate: boolean;
}

/** 寫入 employees 的欄位（新增：完整；更新：只含有變動的欄位）。 */
export interface EmployeePatch {
  code?: string | null;
  name?: string;
  roles?: EmployeeRole[];
  active?: boolean;
  title?: string | null;
  phone?: string | null;
  hired_on?: string | null;
  left_on?: string | null;
}

export type PlanAction = "insert" | "update" | "unchanged" | "skip";

export const PLAN_ACTION_LABELS: Record<PlanAction, string> = {
  insert: "新增",
  update: "更新",
  unchanged: "不變",
  skip: "略過",
};

export interface PlanRow {
  line: number;
  action: PlanAction;
  code: string | null;
  name: string;
  title: string | null;
  /** 預計寫入後的角色。 */
  roles: EmployeeRole[];
  /** 職務對不到角色（預覽標示「無角色」）。 */
  noRole: boolean;
  /** 預計寫入後的在職狀態（skip 時為 null）。 */
  active: boolean | null;
  matchedBy: "code" | "name" | null;
  employeeId: string | null;
  /** 略過原因。 */
  reason: string | null;
  patch: EmployeePatch;
  /** 要寫入的敏感欄位（canWritePrivate = false 時為空）。 */
  private: PrivateValues;
  /** 檔案有敏感欄位、但目前使用者沒有 hr 權限而丟棄。 */
  privateDropped: boolean;
  warnings: string[];
}

export interface PlanSummary {
  insert: number;
  update: number;
  unchanged: number;
  skip: number;
  noRole: number;
  privateRows: number;
  privateDropped: number;
}

/** 非 hr 使用者：敏感欄位在 client 端丟棄（不會送到 server）。 */
export function stripPrivate(rows: readonly ImportRow[]): ImportRow[] {
  return rows.map((r) => ({ ...r, private: {} }));
}

function hasPrivate(p: PrivateValues): boolean {
  return PRIVATE_FIELDS.some((f) => !!p[f]);
}

function sameRoles(a: readonly EmployeeRole[], b: readonly EmployeeRole[]) {
  return a.length === b.length && a.every((r) => b.includes(r));
}

function orderedRoles(roles: Iterable<EmployeeRole>): EmployeeRole[] {
  const set = new Set(roles);
  return EMPLOYEE_ROLES.filter((r) => set.has(r));
}

function decideActive(row: ImportRow, opts: PlanOptions): boolean | undefined {
  switch (opts.status) {
    case "keep":
      return undefined;
    case "active":
      return true;
    case "inactive":
      return false;
    case "compare": {
      const keys = opts.compareKeys;
      if (!keys) return undefined;
      return (
        (!!row.code && keys.codes.has(codeKey(row.code))) ||
        keys.names.has(employeeNameKey(row.name))
      );
    }
  }
}

/**
 * 比對既有員工並產生寫入計畫（可重跑：依員工編號比對，沒有編號或編號對不到才用正規化姓名）。
 *   - 新增：未對到任何員工；角色 = 職務對應；在職依 status（keep → 在職）。
 *   - 更新：只補「檔案有值且與現值不同」的欄位——空白格不會清除既有資料；角色取聯集（不移除既有角色）；
 *           既有員工沒有編號時補上檔案的編號。沒有任何變動 → 「不變」（敏感欄位仍會送出，由 DB 比對）。
 *   - 略過：姓名空白／過長、檔案內編號或姓名重複、編號與姓名分別對到不同員工、
 *           姓名對到的員工已有不同編號、職務或電話過長。
 *   - 離職日 ≤ 今天 → 在職一律 false（同 DB 觸發器）。
 */
export function buildImportPlan(
  rows: readonly ImportRow[],
  existing: readonly ExistingEmployee[],
  opts: PlanOptions,
  today: string,
): PlanRow[] {
  const byCode = new Map<string, ExistingEmployee>();
  const byName = new Map<string, ExistingEmployee>();
  for (const e of existing) {
    if (e.code && codeKey(e.code)) byCode.set(codeKey(e.code), e);
    byName.set(employeeNameKey(e.name), e);
  }
  const seenCodes = new Map<string, number>();
  const seenNames = new Map<string, number>();
  // 同一批新增的姓名／編號（避免兩列對到同一位新員工）
  const claimed = new Set<string>();

  return rows.map((row): PlanRow => {
    const privateDropped = !opts.canWritePrivate && hasPrivate(row.private);
    const priv: PrivateValues = opts.canWritePrivate ? { ...row.private } : {};
    const mappedRoles = titleToRoles(row.title);
    const base: PlanRow = {
      line: row.line,
      action: "skip",
      code: row.code,
      name: row.name,
      title: row.title,
      roles: mappedRoles,
      noRole: mappedRoles.length === 0,
      active: null,
      matchedBy: null,
      employeeId: null,
      reason: null,
      patch: {},
      private: {},
      privateDropped,
      warnings: [...row.warnings],
    };
    const skip = (reason: string): PlanRow => ({ ...base, reason });

    if (!row.name) return skip("姓名空白");
    if (row.name.length > EMPLOYEE_NAME_MAX) {
      return skip(`姓名超過 ${EMPLOYEE_NAME_MAX} 字`);
    }
    if (row.title && row.title.length > EMPLOYEE_SHORT_TEXT_MAX) {
      return skip(`職務超過 ${EMPLOYEE_SHORT_TEXT_MAX} 字`);
    }
    if (row.phone && row.phone.length > EMPLOYEE_SHORT_TEXT_MAX) {
      return skip(`電話超過 ${EMPLOYEE_SHORT_TEXT_MAX} 字`);
    }
    const ck = row.code ? codeKey(row.code) : "";
    const nk = employeeNameKey(row.name);
    if (ck && seenCodes.has(ck)) {
      return skip(`員工編號與第 ${seenCodes.get(ck)} 列重複`);
    }
    if (seenNames.has(nk)) {
      return skip(`姓名與第 ${seenNames.get(nk)} 列重複`);
    }
    if (ck) seenCodes.set(ck, row.line);
    seenNames.set(nk, row.line);

    const codeMatch = ck ? byCode.get(ck) : undefined;
    const nameMatch = byName.get(nk);
    if (codeMatch && nameMatch && codeMatch.id !== nameMatch.id) {
      return skip(
        `員工編號對到「${codeMatch.name}」，姓名卻對到另一位員工（${nameMatch.code ?? "無編號"}）`,
      );
    }
    if (!codeMatch && nameMatch && nameMatch.code && ck) {
      return skip(
        `姓名對到既有員工，但其員工編號為 ${nameMatch.code}（檔案為 ${row.code}）`,
      );
    }
    const match = codeMatch ?? nameMatch ?? null;

    const wantActive = decideActive(row, opts);
    const departed = (left: string | null | undefined) =>
      !!left && left <= today;

    if (!match) {
      if (row.hired_on && row.left_on && row.left_on < row.hired_on) {
        return skip("離職日早於到職日");
      }
      if ((ck && claimed.has(`c:${ck}`)) || claimed.has(`n:${nk}`)) {
        return skip("與本批其他列重複");
      }
      if (ck) claimed.add(`c:${ck}`);
      claimed.add(`n:${nk}`);
      const active = departed(row.left_on) ? false : (wantActive ?? true);
      const patch: EmployeePatch = {
        code: row.code,
        name: row.name,
        roles: mappedRoles,
        active,
        title: row.title,
        phone: row.phone,
      };
      if (row.hired_on !== undefined) patch.hired_on = row.hired_on;
      if (row.left_on !== undefined) patch.left_on = row.left_on;
      return {
        ...base,
        action: "insert",
        active,
        patch,
        private: priv,
      };
    }

    // 更新：只補有值且不同的欄位
    const patch: EmployeePatch = {};
    if (row.code && !match.code) patch.code = row.code;
    if (codeMatch && cleanEmployeeName(match.name) !== row.name) {
      patch.name = row.name;
      base.warnings.push(`姓名將由「${match.name}」改為「${row.name}」`);
    }
    const roles = orderedRoles([...match.roles, ...mappedRoles]);
    if (!sameRoles(roles, match.roles)) patch.roles = roles;
    if (row.title && row.title !== match.title) patch.title = row.title;
    if (row.phone && row.phone !== match.phone) patch.phone = row.phone;
    if (row.hired_on && row.hired_on !== match.hired_on) {
      patch.hired_on = row.hired_on;
    }
    if (row.left_on && row.left_on !== match.left_on) {
      patch.left_on = row.left_on;
    }
    const finalHired = patch.hired_on ?? match.hired_on;
    const finalLeft = patch.left_on ?? match.left_on;
    if (finalHired && finalLeft && finalLeft < finalHired) {
      return skip("離職日早於到職日");
    }
    let active = match.active;
    if (wantActive !== undefined) active = wantActive;
    if (departed(finalLeft)) {
      if (wantActive === true) {
        base.warnings.push("已有離職日，無法設為在職（請先清除離職日）");
      }
      active = false;
    }
    if (active !== match.active) patch.active = active;

    const changed = Object.keys(patch).length > 0;
    return {
      ...base,
      action: changed ? "update" : "unchanged",
      roles,
      noRole: roles.length === 0,
      active,
      matchedBy: codeMatch ? "code" : "name",
      employeeId: match.id,
      patch,
      private: priv,
    };
  });
}

export function summarizePlan(plan: readonly PlanRow[]): PlanSummary {
  const s: PlanSummary = {
    insert: 0,
    update: 0,
    unchanged: 0,
    skip: 0,
    noRole: 0,
    privateRows: 0,
    privateDropped: 0,
  };
  for (const r of plan) {
    s[r.action] += 1;
    if (r.action !== "skip" && r.noRole) s.noRole += 1;
    if (r.action !== "skip" && hasPrivate(r.private)) s.privateRows += 1;
    if (r.privateDropped) s.privateDropped += 1;
  }
  return s;
}

/** 計畫 → 實際寫入動作（新增的員工先給 id，敏感欄位才能直接指向）。 */
export interface ApplyOps {
  inserts: (EmployeePatch & { id: string; name: string })[];
  updates: { id: string; line: number; patch: EmployeePatch }[];
  /** hr_import_employee_private 的 p_rows。 */
  private: ({ employee_id: string } & PrivateValues)[];
}

export function planToOps(
  plan: readonly PlanRow[],
  newId: () => string,
): ApplyOps {
  const ops: ApplyOps = { inserts: [], updates: [], private: [] };
  for (const r of plan) {
    let id: string | null = null;
    if (r.action === "insert") {
      id = newId();
      ops.inserts.push({ ...r.patch, id, name: r.name });
    } else if (r.action === "update" && r.employeeId) {
      id = r.employeeId;
      ops.updates.push({ id, line: r.line, patch: r.patch });
    } else if (r.action === "unchanged" && r.employeeId) {
      id = r.employeeId;
    }
    if (id && hasPrivate(r.private)) {
      ops.private.push({ employee_id: id, ...r.private });
    }
  }
  return ops;
}

/** server action 收到的匯入資料（client 已解析、非 hr 已丟棄敏感欄位）。 */
export interface ImportRequest {
  rows: ImportRow[];
  status: ImportStatusMode;
  compareKeys?: { codes: string[]; names: string[] } | null;
}

export const IMPORT_MAX_ROWS = 2000;

/** 驗證並整理 client 送來的資料（型別不對的欄位丟棄）；回 null = 格式錯誤。 */
export function sanitizeImportRequest(raw: unknown): ImportRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.rows) || r.rows.length > IMPORT_MAX_ROWS) return null;
  const status = r.status;
  if (
    status !== "keep" &&
    status !== "active" &&
    status !== "inactive" &&
    status !== "compare"
  ) {
    return null;
  }
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const date = (v: unknown): string | null | undefined =>
    v === null ? null : typeof v === "string" && isIsoDate(v) ? v : undefined;
  const rows: ImportRow[] = [];
  for (const item of r.rows) {
    if (!item || typeof item !== "object") return null;
    const x = item as Record<string, unknown>;
    const line = Number(x.line);
    if (!Number.isInteger(line) || line < 1) return null;
    const privRaw = (x.private ?? {}) as Record<string, unknown>;
    const priv: PrivateValues = {};
    for (const f of PRIVATE_FIELDS) {
      const v = str(privRaw[f]);
      if (v) priv[f] = v;
    }
    const row: ImportRow = {
      line,
      code: str(x.code),
      name: cleanEmployeeName(typeof x.name === "string" ? x.name : ""),
      title: str(x.title),
      phone: str(x.phone) ? normalizePhone(str(x.phone)) : null,
      private: priv,
      warnings: [],
    };
    const hired = date(x.hired_on);
    const left = date(x.left_on);
    if (hired !== undefined) row.hired_on = hired;
    if (left !== undefined) row.left_on = left;
    rows.push(row);
  }
  let compareKeys: ImportRequest["compareKeys"] = null;
  if (status === "compare") {
    const ck = r.compareKeys as Record<string, unknown> | null | undefined;
    if (!ck || !Array.isArray(ck.codes) || !Array.isArray(ck.names)) {
      return null;
    }
    compareKeys = {
      codes: ck.codes.filter((v): v is string => typeof v === "string"),
      names: ck.names.filter((v): v is string => typeof v === "string"),
    };
  }
  return { rows, status, compareKeys };
}

export function toSheetKeys(
  k: { codes: readonly string[]; names: readonly string[] } | null | undefined,
): SheetKeys | null {
  if (!k) return null;
  return {
    codes: new Set(k.codes.map(codeKey)),
    names: new Set(k.names.map(employeeNameKey)),
  };
}
