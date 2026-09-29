// 方案編輯頁的表單狀態（純函式，無 React / DOM；client 與測試共用）。
// 表單以「草稿」持有方案基本資料與階段／料件列，儲存時再轉成 server action 的輸入：
// savePlanAction ← planDraftToInput、saveStageAction ← stageDraftToInput、
// deleteStageAction ← deletedStageIds。部分失敗時呼叫端只需更新已成功的草稿 id
// （markStageSaved），其餘輸入原封不動留在畫面上。
import { SP_DUPLICATE_STAGE_HOURS_MESSAGE } from "@/lib/service-report/plan/errors";
import { normalizeHpTag } from "@/lib/service-report/plan/match";
import type {
  PlanPart,
  ServicePlan,
  ServicePlanInput,
  ServicePlanStage,
  ServicePlanStageInput,
} from "@/lib/service-report/plan/types";
import { toStageHours } from "@/lib/service-report/plan/validate";

/* ------------------------------------------------------------------ 型別 */

/** 料件列草稿。key 只用於 React list key，不送到 server。 */
export interface PartDraft {
  key: string;
  name: string;
  qty: string;
  unit: string;
}

/** 階段草稿。id 為 null＝尚未存在於 DB 的新階段。 */
export interface StageDraft {
  key: string;
  id: string | null;
  /** 文字（表單輸入），儲存時以 toStageHours 轉整數。 */
  hours: string;
  label: string;
  parts: PartDraft[];
}

/** 方案基本資料草稿。 */
export interface PlanDraft {
  name: string;
  /** 適用馬力多值輸入的原始文字（以頓號／逗號／空白分隔）。 */
  hpTagsText: string;
  active: boolean;
  note: string;
}

/* ------------------------------------------------------------ key 產生器 */

let keySeq = 0;

/** 產生表單列的唯一 key（純粹給 React 用；同一個 session 內不重複）。 */
export function nextDraftKey(prefix = "d"): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

/* ------------------------------------------------------ 馬力多值輸入解析 */

/**
 * 分隔符：半／全形逗號、頓號、分號、斜線與換行。
 * 刻意不把空白當分隔符——「20 HP」「20 馬力」是同一個標籤，切開會變成無意義的「HP」。
 */
const HP_SEPARATOR = /[,，、;；/\r\n]+/;

/**
 * 適用馬力輸入文字 → 標籤陣列：去空白、丟掉空項，並以正規化後的值去重
 * （「20HP」與「20 hp」視為同一個，保留先出現的原文）。
 */
export function parseHpTags(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of (text ?? "").split(HP_SEPARATOR)) {
    const tag = raw.trim();
    if (tag === "") continue;
    const key = normalizeHpTag(tag);
    // 正規化成空字串（例：只打了「HP」）的無法比對，但仍保留原文，
    // 由 validatePlanInput／使用者自行判斷；去重只針對可正規化者。
    if (key !== "") {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    tags.push(tag);
  }
  return tags;
}

/** 標籤陣列 → 輸入框文字（以頓號分隔）。 */
export function formatHpTags(
  tags: readonly string[] | null | undefined,
): string {
  return (tags ?? []).join("、");
}

/* ------------------------------------------------------------ 草稿建構子 */

export function makePartDraft(part?: Partial<PlanPart> | null): PartDraft {
  return {
    key: nextDraftKey("part"),
    name: part?.name ?? "",
    qty: part?.qty ?? "",
    unit: part?.unit ?? "",
  };
}

/** 至少留一列空白料件，使用者才有東西可以打。 */
function ensurePartRows(parts: PartDraft[]): PartDraft[] {
  return parts.length > 0 ? parts : [makePartDraft()];
}

export function makeStageDraft(stage?: ServicePlanStage | null): StageDraft {
  return {
    key: nextDraftKey("stage"),
    id: stage?.id ?? null,
    hours: stage ? String(stage.hours) : "",
    label: stage?.label ?? "",
    parts: ensurePartRows((stage?.parts ?? []).map((p) => makePartDraft(p))),
  };
}

export function makeStageDrafts(
  stages: readonly ServicePlanStage[] | null | undefined,
): StageDraft[] {
  return (stages ?? []).map((s) => makeStageDraft(s));
}

export function makePlanDraft(plan?: ServicePlan | null): PlanDraft {
  return {
    name: plan?.name ?? "",
    hpTagsText: formatHpTags(plan?.hp_tags),
    active: plan?.active ?? true,
    note: plan?.note ?? "",
  };
}

/* ---------------------------------------------------------- 料件列增刪改 */

export function addPartRow(stage: StageDraft): StageDraft {
  return { ...stage, parts: [...stage.parts, makePartDraft()] };
}

/** 刪除料件列；刪到一列不剩時補一列空白（畫面不會變成空的）。 */
export function removePartRow(stage: StageDraft, key: string): StageDraft {
  return {
    ...stage,
    parts: ensurePartRows(stage.parts.filter((p) => p.key !== key)),
  };
}

export function updatePartRow(
  stage: StageDraft,
  key: string,
  patch: Partial<Omit<PartDraft, "key">>,
): StageDraft {
  return {
    ...stage,
    parts: stage.parts.map((p) => (p.key === key ? { ...p, ...patch } : p)),
  };
}

/* ------------------------------------------------------------ 階段增刪改 */

export function addStage(stages: readonly StageDraft[]): StageDraft[] {
  return [...stages, makeStageDraft()];
}

export function removeStage(
  stages: readonly StageDraft[],
  key: string,
): StageDraft[] {
  return stages.filter((s) => s.key !== key);
}

export function updateStage(
  stages: readonly StageDraft[],
  key: string,
  patch: Partial<Omit<StageDraft, "key">>,
): StageDraft[] {
  return stages.map((s) => (s.key === key ? { ...s, ...patch } : s));
}

/** 更新單一階段（以 key 定位）中的料件列。 */
export function mapStage(
  stages: readonly StageDraft[],
  key: string,
  fn: (stage: StageDraft) => StageDraft,
): StageDraft[] {
  return stages.map((s) => (s.key === key ? fn(s) : s));
}

/**
 * 顯示順序：時數由小到大；時數空白／不合法者排在最後（維持原本相對順序），
 * 讓剛新增、還沒填時數的階段停在底部而不會跳走。
 */
export function sortStageDrafts(stages: readonly StageDraft[]): StageDraft[] {
  return stages
    .map((s, i) => ({ s, i, h: toStageHours(s.hours) }))
    .sort((a, b) => {
      if (a.h === null && b.h === null) return a.i - b.i;
      if (a.h === null) return 1;
      if (b.h === null) return -1;
      return a.h !== b.h ? a.h - b.h : a.i - b.i;
    })
    .map((x) => x.s);
}

/* -------------------------------------------------------------- 儲存轉換 */

export function planDraftToInput(
  draft: PlanDraft,
  id: string | null,
): ServicePlanInput {
  return {
    id: id ?? null,
    name: draft.name.trim(),
    hp_tags: parseHpTags(draft.hpTagsText),
    active: draft.active,
    note: draft.note.trim() || null,
  };
}

export function stageDraftToInput(
  draft: StageDraft,
  planId: string,
): ServicePlanStageInput {
  return {
    id: draft.id ?? null,
    plan_id: planId,
    hours: draft.hours.trim(),
    label: draft.label.trim(),
    parts: draft.parts.map((p) => ({
      name: p.name.trim(),
      qty: p.qty.trim(),
      unit: p.unit.trim(),
    })),
  };
}

/** 原本存在、但已被使用者從畫面移除的階段 id（儲存時要呼叫 deleteStageAction）。 */
export function deletedStageIds(
  initialIds: readonly string[],
  stages: readonly StageDraft[],
): string[] {
  const kept = new Set(
    stages.map((s) => s.id).filter((id): id is string => Boolean(id)),
  );
  return initialIds.filter((id) => !kept.has(id));
}

/** 某階段已寫入成功：回填 id，之後重試才不會又新增一筆。 */
export function markStageSaved(
  stages: readonly StageDraft[],
  key: string,
  id: string,
): StageDraft[] {
  return stages.map((s) => (s.key === key ? { ...s, id } : s));
}

/* ------------------------------------------------------------ 前置檢查 */

/**
 * 尚未存在於 DB、且時數／名稱／料件全空的階段（使用者按了「新增階段」又沒填）。
 * 儲存時直接略過，不當成驗證錯誤。既有階段（有 id）一律不算空。
 */
export function isBlankStage(stage: StageDraft): boolean {
  if (stage.id) return false;
  if (stage.hours.trim() !== "" || stage.label.trim() !== "") return false;
  return stage.parts.every(
    (p) => p.name.trim() === "" && p.qty.trim() === "" && p.unit.trim() === "",
  );
}

/**
 * 送出前的本地檢查：同一方案時數重複（DB 也會擋，但先在本地擋掉可避免
 * 「前面幾個階段已寫入、後面才失敗」的半套狀態）。通過回 null。
 */
export function duplicateStageHoursError(
  stages: readonly StageDraft[],
): string | null {
  const seen = new Set<number>();
  for (const s of stages) {
    const h = toStageHours(s.hours);
    if (h === null) continue;
    if (seen.has(h)) return SP_DUPLICATE_STAGE_HOURS_MESSAGE;
    seen.add(h);
  }
  return null;
}

/* ---------------------------------------------------------------- 文案 */

/** 階段錯誤訊息前綴：讓使用者知道是哪一個階段失敗。 */
export function stageErrorText(
  stage: StageDraft,
  index: number,
  error: string,
): string {
  const hours = stage.hours.trim();
  const who =
    hours === "" ? `階段 ${index + 1}` : `階段 ${index + 1}（${hours} 小時）`;
  return `${who}：${error}`;
}

/** 刪除方案的確認文字（含套用機台數）。 */
export function planDeleteConfirmText(plan: {
  name: string;
  machine_count: number;
}): string {
  const tail =
    plan.machine_count > 0
      ? `刪除後 ${plan.machine_count} 台機台將失去方案對應。`
      : "";
  return `確定要刪除方案「${plan.name}」？${tail}此動作無法復原（已開立的報告單會保留階段紀錄）。`;
}

/** 馬力同時比到多個方案時的提示文字；無衝突回 null。 */
export function planConflictText(
  conflicts: readonly string[] | null | undefined,
): string | null {
  const names = (conflicts ?? []).filter((n) => n.trim() !== "");
  if (names.length < 2) return null;
  return `馬力同時符合 ${names.length} 個方案（${names.join("、")}），目前取「${names[0]}」；建議逐台指定。`;
}
