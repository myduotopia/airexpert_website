"use client";
// 員工敏感資料區塊（#257，只有 hr 使用者會被渲染）。
// - 預設顯示遮罩值（server 端 hr_get_employee_private 產生，頁面上沒有明文）。
// - 「顯示」：呼叫 reveal action（DB 寫存取紀錄）取得單一欄位明文，只存在此元件的 state；
//   REVEAL_SECONDS 秒後自動恢復遮罩，切到其他分頁（visibilitychange → hidden）立即恢復，
//   離開頁面時元件卸載、明文隨之丟棄。
// - 「編輯敏感資料」：不預填明文；留白 = 不變、勾「清除」= 清除、有輸入 = 覆寫。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRIVATE_FIELDS,
  PRIVATE_FIELD_LABELS,
  PRIVATE_FIELD_MAX,
  PRIVATE_MULTILINE,
  addReveal,
  buildPrivatePatch,
  privateDisplay,
  privatePatchError,
  pruneReveals,
  revealSecondsLeft,
  type PrivateField,
  type PrivateValues,
  type PrivateView,
  type RevealState,
} from "@/lib/employees/private";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import {
  revealEmployeePrivateAction,
  updateEmployeePrivateAction,
} from "../private-actions";

/** 目前時間（事件處理與計時器用；不在 render 期間呼叫）。 */
function nowMs(): number {
  return Date.now();
}

const BTN =
  "border-border hover:bg-surface-muted inline-flex h-8 items-center rounded-md border bg-white px-3 text-[13px] font-medium disabled:opacity-50";

export function PrivateDataPanel({
  employeeId,
  initial,
}: {
  employeeId: string;
  initial: PrivateView;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [revealed, setRevealed] = useState<RevealState>({});
  const [now, setNow] = useState(nowMs);
  const [busyField, setBusyField] = useState<PrivateField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<PrivateValues>({});
  const [clear, setClear] = useState<PrivateField[]>([]);
  const [saving, setSaving] = useState(false);

  const anyRevealed = Object.keys(revealed).length > 0;

  // 倒數與到期恢復遮罩（只在有明文時計時）
  useEffect(() => {
    if (!anyRevealed) return;
    const t = window.setInterval(() => {
      const n = nowMs();
      setNow(n);
      setRevealed((s) => pruneReveals(s, n));
    }, 1000);
    return () => window.clearInterval(t);
  }, [anyRevealed]);

  // 切到其他分頁或縮小視窗 → 立即恢復遮罩
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") setRevealed({});
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  async function reveal(field: PrivateField) {
    setBusyField(field);
    setError(null);
    try {
      const res = await revealEmployeePrivateAction(employeeId, field);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 等待回應期間已切到其他分頁 → 不顯示（與 visibilitychange 恢復遮罩一致）
      if (document.visibilityState === "hidden") return;
      const n = nowMs();
      setNow(n);
      setRevealed((s) => addReveal(s, field, res.value, n));
    } catch (e) {
      setError((e as Error)?.message || "讀取失敗，請確認網路後再試一次。");
    } finally {
      setBusyField(null);
    }
  }

  function hide(field: PrivateField) {
    setRevealed((s) => {
      const next = { ...s };
      delete next[field];
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const patch = buildPrivatePatch(values, clear);
    if (Object.keys(patch).length === 0) {
      setError("沒有要修改的欄位（留白 = 不變；要刪除請勾「清除」）。");
      return;
    }
    const tooLong = privatePatchError(patch);
    if (tooLong) {
      setError(tooLong);
      return;
    }
    setSaving(true);
    try {
      const res = await updateEmployeePrivateAction(employeeId, values, clear);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setView(res.view);
      setRevealed({});
      setValues({});
      setClear([]);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error)?.message || "儲存失敗，請確認網路後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
        {PRIVATE_FIELDS.map((f) => {
          const r = revealed[f];
          const masked = view.fields[f];
          return (
            <div key={f} className="min-w-0">
              <dt className="text-text-muted">{PRIVATE_FIELD_LABELS[f]}</dt>
              <dd className="flex flex-wrap items-start gap-2">
                <span
                  className={`text-ink min-w-0 break-words whitespace-pre-wrap ${f === "national_id" ? "font-mono" : ""}`}
                >
                  {r ? (r.value ?? "未填寫") : privateDisplay(masked)}
                </span>
                {masked !== null &&
                  (r ? (
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => hide(f)}
                    >
                      隱藏（{revealSecondsLeft(revealed, f, now)} 秒）
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={BTN}
                      disabled={busyField !== null}
                      onClick={() => reveal(f)}
                    >
                      {busyField === f ? "讀取中…" : "顯示"}
                    </button>
                  ))}
              </dd>
            </div>
          );
        })}
      </dl>

      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}

      {!editing ? (
        <div>
          <button
            type="button"
            className={BTN}
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
          >
            編輯敏感資料
          </button>
        </div>
      ) : (
        <form
          onSubmit={save}
          className="border-border flex flex-col gap-4 rounded-lg border p-4"
        >
          <p className="text-text-muted text-[13px]">
            留白的欄位不變；要修改請整段重新輸入；要刪除請勾「清除」。儲存後會加密保存並留下紀錄。
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PRIVATE_FIELDS.map((f) => {
              const id = `private-${f}`;
              const cleared = clear.includes(f);
              const common = {
                id,
                value: values[f] ?? "",
                maxLength: PRIVATE_FIELD_MAX[f],
                disabled: cleared,
                autoComplete: "off",
                placeholder: cleared
                  ? "將清除"
                  : view.fields[f]
                    ? "留白 = 不變"
                    : "未填寫",
              };
              return (
                <div
                  key={f}
                  className={`flex flex-col gap-1.5 ${PRIVATE_MULTILINE.has(f) ? "sm:col-span-2" : ""}`}
                >
                  <label
                    htmlFor={id}
                    className="text-ink text-[14px] font-medium"
                  >
                    {PRIVATE_FIELD_LABELS[f]}
                  </label>
                  {PRIVATE_MULTILINE.has(f) ? (
                    <textarea
                      {...common}
                      rows={2}
                      className={ERP_AREA}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [f]: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      {...common}
                      className={ERP_INPUT}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, [f]: e.target.value }))
                      }
                    />
                  )}
                  {view.fields[f] !== null && (
                    <label className="text-text-muted flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={cleared}
                        onChange={(e) =>
                          setClear((s) =>
                            e.target.checked
                              ? [...s.filter((x) => x !== f), f]
                              : s.filter((x) => x !== f),
                          )
                        }
                      />
                      清除
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary-deep h-10 rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {saving ? "儲存中…" : "儲存敏感資料"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="border-border hover:bg-surface-muted h-10 rounded-lg border bg-white px-5 text-[14px] font-semibold disabled:opacity-50"
              onClick={() => {
                setEditing(false);
                setValues({});
                setClear([]);
                setError(null);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
