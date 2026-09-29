"use client";
// 保養方案編輯表單（spec §6）：基本資料 + 階段編輯器（時數／名稱／料件列）。
// 儲存流程：savePlanAction → 逐筆 deleteStageAction（畫面上被移除的既有階段）
// → 逐筆 saveStageAction。任何一步失敗就停下並顯示中文訊息（標明是哪一個階段），
// 畫面上的輸入完全保留；已寫入成功的階段會回填 id，重試不會變成重複新增。
import { useState } from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import {
  MAX_STAGE_PARTS,
  PLAN_TEXT_LIMITS,
  type ServicePlanWithStages,
} from "@/lib/service-report/plan/types";
import {
  deletePlanAction,
  deleteStageAction,
  savePlanAction,
  saveStageAction,
} from "../actions";
import {
  addPartRow,
  addStage,
  deletedStageIds,
  duplicateStageHoursError,
  isBlankStage,
  makePlanDraft,
  makeStageDrafts,
  mapStage,
  markStageSaved,
  planDeleteConfirmText,
  planDraftToInput,
  removePartRow,
  removeStage,
  sortStageDrafts,
  stageDraftToInput,
  stageErrorText,
  updatePartRow,
  updateStage,
  type PlanDraft,
  type StageDraft,
} from "./plan-form-state";
import { PLANS_PATH } from "./plan-ui";

const PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-11 items-center rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50";
const SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border bg-white px-6 text-[15px] font-semibold disabled:opacity-50";
const SMALL =
  "border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold disabled:opacity-50";
const SMALL_DANGER =
  "inline-flex h-9 items-center rounded-lg border border-red-200 bg-white px-3 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50";
const DANGER =
  "inline-flex h-11 items-center rounded-lg border border-red-200 bg-white px-6 text-[15px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50";

function Label({
  children,
  htmlFor,
  required,
}: {
  children: string;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-ink text-[14px] font-medium">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

export function PlanForm({
  plan,
  machineCount = 0,
}: {
  /** 有值＝編輯既有方案；undefined＝新增。 */
  plan?: ServicePlanWithStages;
  /** 目前套用此方案的機台數（刪除確認用）。 */
  machineCount?: number;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(plan?.id ?? null);
  const [draft, setDraft] = useState<PlanDraft>(() => makePlanDraft(plan));
  const [stages, setStages] = useState<StageDraft[]>(() =>
    makeStageDrafts(plan?.stages),
  );
  /** 目前確定存在於 DB 的階段 id（用來算出要刪除哪些）。 */
  const [dbStageIds, setDbStageIds] = useState<string[]>(() =>
    (plan?.stages ?? []).map((s) => s.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const ordered = sortStageDrafts(stages);
    setStages(ordered);
    const duplicate = duplicateStageHoursError(ordered);
    if (duplicate) {
      setError(duplicate);
      return;
    }

    setBusy(true);
    let list = ordered;
    let known = dbStageIds;
    const fail = (message: string) => {
      setStages(list);
      setDbStageIds(known);
      setError(message);
      setBusy(false);
    };

    try {
      const planRes = await savePlanAction(planDraftToInput(draft, planId));
      if (!planRes.ok) {
        fail(planRes.error);
        return;
      }
      const id = planRes.data.id;
      setPlanId(id);

      for (const stageId of deletedStageIds(known, list)) {
        const res = await deleteStageAction(stageId);
        if (!res.ok) {
          fail(`刪除階段失敗：${res.error}`);
          return;
        }
        known = known.filter((x) => x !== stageId);
      }

      for (let i = 0; i < list.length; i++) {
        const stage = list[i];
        // 全空的新階段（使用者按了新增又沒填）直接略過，不當成錯誤。
        if (isBlankStage(stage)) continue;
        const res = await saveStageAction(stageDraftToInput(stage, id));
        if (!res.ok) {
          fail(stageErrorText(stage, i, res.error));
          return;
        }
        list = markStageSaved(list, stage.key, res.data.id);
        if (!known.includes(res.data.id)) known = [...known, res.data.id];
      }

      setStages(list);
      setDbStageIds(known);
      router.push(PLANS_PATH);
      router.refresh();
    } catch (err) {
      unstable_rethrow(err);
      fail("儲存失敗，請檢查網路連線後再試一次。");
    }
  }

  function onDeletePlan() {
    if (!planId || busy) return;
    if (
      !window.confirm(
        planDeleteConfirmText({
          name: draft.name.trim() || "（未命名）",
          machine_count: machineCount,
        }),
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    void (async () => {
      try {
        const res = await deletePlanAction(planId);
        if (!res.ok) {
          setError(res.error);
          setBusy(false);
          return;
        }
        router.push(PLANS_PATH);
        router.refresh();
      } catch (err) {
        unstable_rethrow(err);
        setError("刪除失敗，請檢查網路連線後再試一次。");
        setBusy(false);
      }
    })();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-name" required>
            方案名稱
          </Label>
          <input
            id="plan-name"
            className={ERP_INPUT}
            value={draft.name}
            maxLength={PLAN_TEXT_LIMITS.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="例：20HP 空壓機"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-hp">適用馬力</Label>
          <input
            id="plan-hp"
            className={ERP_INPUT}
            value={draft.hpTagsText}
            onChange={(e) => set("hpTagsText", e.target.value)}
            placeholder="例：20HP、20"
          />
          <p className="text-text-muted text-[12px]">
            以頓號或逗號分隔（空白不算分隔）。比對時會自動正規化，20HP／20／20
            馬力視為同一個；留空＝通用預設，套用到所有沒有其他對應的空壓機。
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="plan-note">備註</Label>
          <textarea
            id="plan-note"
            rows={2}
            className={ERP_AREA}
            value={draft.note}
            maxLength={PLAN_TEXT_LIMITS.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          啟用（停用後不再自動比對，含通用預設；已逐台指定者仍沿用）
        </label>
      </div>

      <section className="border-border rounded-xl border bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-ink text-[16px] font-semibold">保養階段</h2>
            <p className="text-text-muted mt-1 text-[13px]">
              依累計運轉時數分階段；儲存後會依時數由小到大排序。最大時數＝一輪循環，之後自動延伸（2000／4000／6000
              → 8000／10000／12000…），不必另外建 8000
              以上的階段。階段與料件的變更都在按下「儲存」時一併寫入。
            </p>
          </div>
          <button
            type="button"
            className={SMALL}
            disabled={busy}
            onClick={() => setStages((prev) => addStage(prev))}
          >
            新增階段
          </button>
        </div>

        {stages.length === 0 && (
          <p className="border-border text-text-muted rounded-lg border border-dashed p-6 text-center text-[14px]">
            尚未設定階段，請點「新增階段」（例：2000 小時 基礎保養）。
          </p>
        )}

        <div className="flex flex-col gap-4">
          {stages.map((stage, index) => (
            <fieldset
              key={stage.key}
              className="border-border rounded-lg border p-4"
            >
              <legend className="text-text-muted px-1 text-[13px]">
                階段 {index + 1}
              </legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex w-[140px] flex-col gap-1.5">
                  <Label htmlFor={`${stage.key}-hours`} required>
                    時數
                  </Label>
                  <input
                    id={`${stage.key}-hours`}
                    className={ERP_INPUT}
                    inputMode="numeric"
                    value={stage.hours}
                    onChange={(e) =>
                      setStages((prev) =>
                        updateStage(prev, stage.key, { hours: e.target.value }),
                      )
                    }
                    onBlur={() => setStages((prev) => sortStageDrafts(prev))}
                    placeholder="2000"
                  />
                </div>
                <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                  <Label htmlFor={`${stage.key}-label`} required>
                    階段名稱
                  </Label>
                  <input
                    id={`${stage.key}-label`}
                    className={ERP_INPUT}
                    value={stage.label}
                    maxLength={PLAN_TEXT_LIMITS.stage_label}
                    onChange={(e) =>
                      setStages((prev) =>
                        updateStage(prev, stage.key, { label: e.target.value }),
                      )
                    }
                    placeholder="例：基礎保養／年度保養"
                  />
                </div>
                <button
                  type="button"
                  className={SMALL_DANGER}
                  disabled={busy}
                  onClick={() =>
                    setStages((prev) => removeStage(prev, stage.key))
                  }
                >
                  刪除階段
                </button>
              </div>

              <div className="mt-4">
                <p className="text-ink mb-2 text-[14px] font-medium">料件</p>
                <div className="flex flex-col gap-2">
                  {stage.parts.map((part) => (
                    <div key={part.key} className="flex flex-wrap gap-2">
                      <input
                        aria-label="料件品名"
                        className={`${ERP_INPUT} min-w-[180px] flex-1`}
                        value={part.name}
                        maxLength={PLAN_TEXT_LIMITS.part_name}
                        onChange={(e) =>
                          setStages((prev) =>
                            mapStage(prev, stage.key, (s) =>
                              updatePartRow(s, part.key, {
                                name: e.target.value,
                              }),
                            ),
                          )
                        }
                        placeholder="例：螺旋專用油"
                      />
                      <input
                        aria-label="料件數量"
                        className={`${ERP_INPUT} w-[100px]`}
                        value={part.qty}
                        maxLength={PLAN_TEXT_LIMITS.part_qty}
                        onChange={(e) =>
                          setStages((prev) =>
                            mapStage(prev, stage.key, (s) =>
                              updatePartRow(s, part.key, {
                                qty: e.target.value,
                              }),
                            ),
                          )
                        }
                        placeholder="數量"
                      />
                      <input
                        aria-label="料件單位"
                        className={`${ERP_INPUT} w-[90px]`}
                        value={part.unit}
                        maxLength={PLAN_TEXT_LIMITS.part_unit}
                        onChange={(e) =>
                          setStages((prev) =>
                            mapStage(prev, stage.key, (s) =>
                              updatePartRow(s, part.key, {
                                unit: e.target.value,
                              }),
                            ),
                          )
                        }
                        placeholder="單位"
                      />
                      <button
                        type="button"
                        className={SMALL_DANGER}
                        disabled={busy}
                        onClick={() =>
                          setStages((prev) =>
                            mapStage(prev, stage.key, (s) =>
                              removePartRow(s, part.key),
                            ),
                          )
                        }
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${SMALL} mt-2`}
                  disabled={busy || stage.parts.length >= MAX_STAGE_PARTS}
                  onClick={() =>
                    setStages((prev) =>
                      mapStage(prev, stage.key, (s) => addPartRow(s)),
                    )
                  }
                >
                  新增料件
                </button>
                <p className="text-text-muted mt-2 text-[12px]">
                  數量與單位在開單時會組成報告單的數量（例：1 + 桶 →「1桶」）。
                </p>
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "儲存中…" : "儲存"}
        </button>
        <Link href={PLANS_PATH} className={SECONDARY}>
          取消
        </Link>
        {planId && (
          <button
            type="button"
            className={`${DANGER} ml-auto`}
            disabled={busy}
            onClick={onDeletePlan}
          >
            刪除方案
          </button>
        )}
      </div>
    </form>
  );
}
