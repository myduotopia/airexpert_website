// 保養方案 / 階段的表單驗證與正規化 — 純函式（client / server 皆可用）。
// validate*：回第一個中文錯誤或 null；normalize*：通過驗證後挑出欄位、去空白、去重。
import { PART_QTY_MAX } from "../validate";
import { isUuid } from "../validate";
import { normalizeHpTag } from "./match";
import {
  MAX_HOURS,
  MAX_HP_TAGS,
  MAX_STAGE_PARTS,
  PLAN_TEXT_LIMITS,
  type PlanPart,
  type ServicePlanInput,
  type ServicePlanStageInput,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 方案寫入 DB 的欄位。 */
export interface ServicePlanWrite {
  name: string;
  hp_tags: string[];
  active: boolean;
  note: string | null;
}

/** 階段寫入 DB 的欄位。 */
export interface ServicePlanStageWrite {
  plan_id: string;
  hours: number;
  label: string;
  parts: PlanPart[];
}

/** 時數輸入（數字或字串）→ 整數；不合法回 null。 */
export function toStageHours(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isInteger(v) && v > 0 && v <= MAX_HOURS ? v : null;
  }
  const t = trimmed(v).replace(/,/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 && n <= MAX_HOURS ? n : null;
}

/** 方案驗證。通過回 null。 */
export function validatePlanInput(input: unknown): string | null {
  if (!isRecord(input)) return "資料格式不正確";
  if (input.id !== undefined && input.id !== null && !isUuid(input.id)) {
    return "找不到保養方案";
  }
  const name = trimmed(input.name);
  if (name === "") return "請輸入方案名稱";
  if (name.length > PLAN_TEXT_LIMITS.name) {
    return `方案名稱不可超過 ${PLAN_TEXT_LIMITS.name} 字`;
  }
  if (!Array.isArray(input.hp_tags)) return "適用馬力格式不正確";
  if (input.hp_tags.length > MAX_HP_TAGS) {
    return `適用馬力最多 ${MAX_HP_TAGS} 個`;
  }
  for (const tag of input.hp_tags) {
    if (typeof tag !== "string") return "適用馬力格式不正確";
    if (tag.trim().length > PLAN_TEXT_LIMITS.hp_tag) {
      return `適用馬力每個不可超過 ${PLAN_TEXT_LIMITS.hp_tag} 字`;
    }
  }
  if (input.active !== undefined && typeof input.active !== "boolean") {
    return "啟用狀態格式不正確";
  }
  const note = input.note;
  if (note !== undefined && note !== null && typeof note !== "string") {
    return "備註格式不正確";
  }
  if (trimmed(note).length > PLAN_TEXT_LIMITS.note) {
    return `備註不可超過 ${PLAN_TEXT_LIMITS.note} 字`;
  }
  return null;
}

/** 通過 validatePlanInput 後呼叫：去空白、馬力標籤去空與去重（正規化後相同者只留第一個）。 */
export function normalizePlanInput(input: ServicePlanInput): ServicePlanWrite {
  const seen = new Set<string>();
  const hp_tags: string[] = [];
  for (const raw of input.hp_tags ?? []) {
    const tag = trimmed(raw);
    if (tag === "") continue;
    const key = normalizeHpTag(tag);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    hp_tags.push(tag);
  }
  const note = trimmed(input.note);
  return {
    name: trimmed(input.name),
    hp_tags,
    active: input.active !== false,
    note: note === "" ? null : note,
  };
}

function validateParts(parts: unknown): string | null {
  if (!Array.isArray(parts)) return "料件格式不正確";
  if (parts.length > MAX_STAGE_PARTS) {
    return `料件最多 ${MAX_STAGE_PARTS} 列`;
  }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!isRecord(p)) return `料件第 ${i + 1} 列格式不正確`;
    for (const key of ["name", "qty", "unit"] as const) {
      const v = p[key];
      if (v !== undefined && v !== null && typeof v !== "string") {
        return `料件第 ${i + 1} 列格式不正確`;
      }
    }
    const name = trimmed(p.name);
    const qty = trimmed(p.qty);
    const unit = trimmed(p.unit);
    if (name === "") {
      // 整列皆空＝未填的空列，正規化時丟掉；只填數量沒填品名才是錯誤。
      if (qty !== "" || unit !== "") return `料件第 ${i + 1} 列請填品名`;
      continue;
    }
    if (name.length > PLAN_TEXT_LIMITS.part_name) {
      return `料件第 ${i + 1} 列品名不可超過 ${PLAN_TEXT_LIMITS.part_name} 字`;
    }
    if (qty.length > PLAN_TEXT_LIMITS.part_qty) {
      return `料件第 ${i + 1} 列數量不可超過 ${PLAN_TEXT_LIMITS.part_qty} 字`;
    }
    if (unit.length > PLAN_TEXT_LIMITS.part_unit) {
      return `料件第 ${i + 1} 列單位不可超過 ${PLAN_TEXT_LIMITS.part_unit} 字`;
    }
    // 帶入報告單時數量＝qty + unit，需符合報告單的數量長度上限。
    if (qty.length + unit.length > PART_QTY_MAX) {
      return `料件第 ${i + 1} 列數量加單位不可超過 ${PART_QTY_MAX} 字`;
    }
  }
  return null;
}

/** 階段驗證。通過回 null。 */
export function validateStageInput(input: unknown): string | null {
  if (!isRecord(input)) return "資料格式不正確";
  if (input.id !== undefined && input.id !== null && !isUuid(input.id)) {
    return "找不到保養階段";
  }
  if (!isUuid(input.plan_id)) return "找不到保養方案";
  if (toStageHours(input.hours) === null) {
    return `時數需為 1–${MAX_HOURS} 的整數`;
  }
  const label = trimmed(input.label);
  if (label === "") return "請輸入階段名稱";
  if (label.length > PLAN_TEXT_LIMITS.stage_label) {
    return `階段名稱不可超過 ${PLAN_TEXT_LIMITS.stage_label} 字`;
  }
  return validateParts(input.parts);
}

/** 通過 validateStageInput 後呼叫：去空白、丟掉整列皆空的料件、單位空字串不寫入。 */
export function normalizeStageInput(
  input: ServicePlanStageInput,
): ServicePlanStageWrite {
  const parts: PlanPart[] = [];
  for (const raw of input.parts ?? []) {
    const name = trimmed(raw?.name);
    if (name === "") continue;
    const qty = trimmed(raw?.qty);
    const unit = trimmed(raw?.unit);
    parts.push(unit === "" ? { name, qty } : { name, qty, unit });
  }
  return {
    plan_id: input.plan_id,
    hours: toStageHours(input.hours) ?? 0,
    label: trimmed(input.label),
    parts,
  };
}
