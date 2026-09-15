"use client";
// 匯出 CSV：呼叫 server action 取得 CSV 字串（含 BOM），以 Blob 觸發下載。
import { useState, useTransition } from "react";
import { ERP_BUTTON_SECONDARY } from "@/components/erp/styles";
import { exportReportCsvAction, type ReportCsvInput } from "./actions";

export function CsvExportButton({ input }: { input: ReportCsvInput }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await exportReportCsvAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.data.csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-[13px] text-red-600">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={ERP_BUTTON_SECONDARY}
      >
        {pending ? "匯出中…" : "匯出 CSV"}
      </button>
    </div>
  );
}
