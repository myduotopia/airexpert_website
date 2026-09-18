"use client";

// 報告單列印頁殼層（spec §5.3）：工具列（返回／校正設定／可列印範圍警示／列印）＋ 整張 A4 ReportSheet。
//
// 列印單頁的關鍵：
//  1. 掛載時把 pageRule()（@page size 210×297mm、margin 0）插入 <style>，離開時移除。
//     (print)/layout.tsx 的 PrintStyles 也有 @page（A4、12mm 邊界），@page 無選擇器優先權，
//     只看文件順序 → 這裡把 style 接在 document.body 最後面才蓋得掉。
//  2. 列印時工具列與其他區塊 display:none（非 visibility），body 不留 margin/padding，
//     ReportSheet 的 .print 容器本身就是 210×297mm → 剛好一頁。
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  checkPrintableArea,
  pageRule,
  type Calibration,
} from "@/lib/service-report/layout";
import type { ServiceReportSheetData } from "@/lib/service-report/types";
import { calibrationStore } from "./calibration-store";
import { CalibrationPanel } from "./CalibrationPanel";
import { ReportSheet } from "./ReportSheet";

/** 只在列印頁作用的樣式；類別一律 sr-print- 前綴。 */
const PRINT_CSS = `
.sr-print-body { background:#e5e7eb; min-height:100dvh; padding:72px 16px 32px; color:#111; }
.sr-print-stage { display:flex; flex-direction:column; align-items:center; gap:16px; }
.sr-print-paper { box-shadow:0 1px 6px rgba(0,0,0,.2); background:#fff; }
.sr-print-toolbar { position:fixed; inset:0 0 auto 0; z-index:50; }
@media print {
  html, body { background:#fff !important; margin:0 !important; padding:0 !important; display:block !important; min-height:0 !important; height:auto !important; }
  .sr-print-body { background:#fff; padding:0; margin:0; min-height:0; }
  .sr-print-stage { display:block; gap:0; margin:0 !important; }
  .sr-print-paper { box-shadow:none; }
  .sr-print-toolbar, .sr-print-noprint { display:none !important; }
}
`;

const BTN =
  "inline-flex h-9 shrink-0 items-center rounded-lg px-4 text-[14px] font-semibold disabled:opacity-50";

export type RecordPrint = () => Promise<
  { ok: true } | { ok: false; error: string }
>;

/** 按「列印」的決策（純非同步邏輯，便於單測）：先記錄列印次數，成功才真的列印。 */
export type PrintDecision = { print: true } | { print: false; error: string };

export async function resolvePrint(opts: {
  /** 不可列印的原因（作廢單）。 */
  blockedReason?: string | null;
  /** 記錄列印的 server action；不傳＝空白表單，不寫 DB。 */
  record?: RecordPrint;
}): Promise<PrintDecision> {
  if (opts.blockedReason) return { print: false, error: opts.blockedReason };
  if (!opts.record) return { print: true };
  try {
    const res = await opts.record();
    return res.ok ? { print: true } : { print: false, error: res.error };
  } catch (e) {
    unstable_rethrow(e);
    // 網路 / server action 失敗：不列印，避免紙本與列印紀錄不一致。
    return { print: false, error: "記錄列印失敗，請檢查網路連線後再試一次。" };
  }
}

export interface SheetPrintViewProps {
  data: ServiceReportSheetData;
  title: string;
  backHref: string;
  logoUrl?: string | null;
  /**
   * 按「列印」時先記錄列印次數；成功才 window.print()。
   * 不傳（空白表單）＝不寫 DB，直接列印。
   */
  onRecordPrint?: RecordPrint;
  /** 不可列印時的中文原因（例：已作廢的報告單不可列印）。 */
  blockedReason?: string | null;
  /** 頁面上方的提示（作廢原因等）。 */
  notice?: { title: string; detail?: string | null } | null;
}

export function SheetPrintView({
  data,
  title,
  backHref,
  logoUrl,
  onRecordPrint,
  blockedReason,
  notice,
}: SheetPrintViewProps) {
  const router = useRouter();
  // 校正值：server 快照＝預設值，client 掛載後才讀 localStorage（見 ./calibration-store.ts）。
  const { calibration, persisted } = useSyncExternalStore(
    calibrationStore.subscribe,
    calibrationStore.getSnapshot,
    calibrationStore.getServerSnapshot,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  // @page 與列印樣式：掛載時插入 document.body 最後，離開時移除（spec §5.1）。
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-sr-print", "");
    style.textContent = `${pageRule()}\n${PRINT_CSS}`;
    document.body.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  const onCalibrationChange = useCallback((next: Calibration) => {
    calibrationStore.set(next);
  }, []);

  const warnings = checkPrintableArea(calibration);

  async function print() {
    setError(null);
    setPrinting(true);
    try {
      const decision = await resolvePrint({
        blockedReason,
        record: onRecordPrint,
      });
      if (!decision.print) {
        setError(decision.error);
        return;
      }
      window.print();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="sr-print-body">
      <div className="sr-print-toolbar border-border flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
        <span className="text-ink mr-auto truncate text-[14px] font-semibold">
          {title}
        </span>
        <button
          type="button"
          className={`${BTN} border-border hover:bg-surface-muted border bg-white`}
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(backHref);
          }}
        >
          返回
        </button>
        <button
          type="button"
          aria-expanded={panelOpen}
          className={`${BTN} border-border hover:bg-surface-muted border bg-white`}
          onClick={() => setPanelOpen((v) => !v)}
        >
          校正設定
        </button>
        <button
          type="button"
          className={`${BTN} bg-primary hover:bg-primary-deep text-white`}
          onClick={print}
          disabled={printing}
        >
          {printing ? "處理中…" : "列印"}
        </button>
      </div>

      <div className="sr-print-noprint mx-auto mt-2 flex w-full max-w-[210mm] flex-col gap-2">
        {notice && (
          <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"
          >
            <span className="font-semibold">{notice.title}</span>
            {notice.detail ? <span>：{notice.detail}</span> : null}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
          >
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"
          >
            <span className="font-semibold">可列印範圍警示</span>
            <ul className="mt-1 list-inside list-disc">
              {warnings.map((w) => (
                <li key={w.edge}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}
        {panelOpen && (
          <CalibrationPanel
            value={calibration}
            onChange={onCalibrationChange}
            persisted={persisted}
          />
        )}
      </div>

      <div className="sr-print-stage mt-3">
        <ReportSheet
          mode="print"
          data={data}
          calibration={calibration}
          logoUrl={logoUrl}
          className="sr-print-paper"
        />
      </div>
    </div>
  );
}
