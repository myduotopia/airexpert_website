"use client";
// 處理進度時間軸 Dialog（#272，進廠維修與新機問題共用）：新到舊列出、追加一筆（日期預設今天）、刪除。
// 父層只在開啟時渲染；有異動時關閉後 router.refresh()（清單的「最新進度」欄才會更新）。
import { useEffect, useState, useTransition } from "react";
import { ErpDialog } from "@/components/erp/ErpDialog";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { ERP_AREA } from "@/components/erp/styles";
import { rocDate } from "@/lib/admin/minguo";
import {
  addProgressAction,
  deleteProgressAction,
  listProgressAction,
} from "@/lib/erp/tracking/actions";
import {
  TRACKING_LIMITS,
  type ProgressEntry,
  type ProgressInput,
  type ProgressParent,
} from "@/lib/erp/tracking/types";
import { BTN_PRIMARY, BTN_SECONDARY, FormField } from "./ui";

export function ProgressDialog({
  parent,
  parentId,
  title,
  today,
  onClose,
}: {
  parent: ProgressParent;
  parentId: string;
  /** 例：「客戶甲：異音」。 */
  title: string;
  /** 台北今天（YYYY-MM-DD），新增進度的預設日期。 */
  today: string;
  /** changed：本次是否有新增／刪除。 */
  onClose: (changed: boolean) => void;
}) {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [changed, setChanged] = useState(false);
  const [date, setDate] = useState(today);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<keyof ProgressInput | null>(null);
  const [saving, startSaving] = useTransition();
  const [askConfirm, confirmDialog] = useConfirm();

  useEffect(() => {
    let cancelled = false;
    listProgressAction(parent, parentId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setEntries(res.data);
        setLoadError(null);
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [parent, parentId, reloadKey]);

  function add() {
    setError(null);
    setField(null);
    startSaving(async () => {
      const res = await addProgressAction(parent, parentId, {
        progress_date: date,
        content,
      });
      if (!res.ok) {
        setError(res.error);
        setField(res.field ?? null);
        return;
      }
      setContent("");
      setDate(today);
      setChanged(true);
      setReloadKey((k) => k + 1);
    });
  }

  async function remove(entry: ProgressEntry) {
    const ok = await askConfirm({
      title: "確定刪除這筆進度？",
      message: `${rocDate(entry.progress_date)}：${entry.content}`,
      confirmLabel: "刪除",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    setField(null);
    const res = await deleteProgressAction(parent, entry.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setChanged(true);
    setReloadKey((k) => k + 1);
  }

  return (
    <ErpDialog
      open
      onClose={() => onClose(changed)}
      title="處理進度"
      description={title}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="border-border mb-5 grid grid-cols-1 gap-3 rounded-lg border p-4"
      >
        <FormField
          label="日期"
          htmlFor="progress-date"
          required
          error={field === "progress_date" ? error : null}
        >
          <RocDateInput
            id="progress-date"
            value={date}
            onChange={setDate}
            aria-label="進度日期"
          />
        </FormField>
        <FormField
          label="進度內容"
          htmlFor="progress-content"
          required
          error={field === "content" ? error : null}
        >
          <textarea
            id="progress-content"
            data-autofocus
            rows={3}
            className={ERP_AREA}
            value={content}
            maxLength={TRACKING_LIMITS.content}
            onChange={(e) => setContent(e.target.value)}
          />
        </FormField>
        {error && !field && (
          <p role="alert" className="text-[14px] text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className={BTN_PRIMARY} disabled={saving}>
            {saving ? "新增中…" : "新增進度"}
          </button>
        </div>
      </form>

      {loadError ? (
        <p role="alert" className="text-[14px] text-red-600">
          {loadError}
        </p>
      ) : entries === null ? (
        <p className="text-text-muted text-[14px]">讀取中…</p>
      ) : entries.length === 0 ? (
        <p className="text-text-muted text-[14px]">尚無處理進度。</p>
      ) : (
        <ol className="border-border relative ml-2 border-l">
          {entries.map((e, i) => (
            <li key={e.id} className="mb-4 ml-4">
              <span
                className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${
                  i === 0 ? "bg-primary" : "bg-gray-300"
                }`}
                aria-hidden
              />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-ink text-[13px] font-semibold">
                  {rocDate(e.progress_date)}
                  {i === 0 && (
                    <span className="text-primary-deep ml-2 text-[12px]">
                      最新
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-[12px] font-semibold text-red-600 hover:text-red-700"
                  onClick={() => remove(e)}
                >
                  刪除
                </button>
              </div>
              <p className="text-ink mt-0.5 text-[14px] whitespace-pre-wrap">
                {e.content}
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className={BTN_SECONDARY}
          onClick={() => onClose(changed)}
        >
          關閉
        </button>
      </div>
      {confirmDialog}
    </ErpDialog>
  );
}
