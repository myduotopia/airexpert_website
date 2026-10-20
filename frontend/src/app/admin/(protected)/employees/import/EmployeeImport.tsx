"use client";
// 員工匯入（#257）：選檔 → 選工作表 → 標題列（自動偵測「員工編號」列，可調整）→ 欄位對應 →
// 在職／離職設定 → 預覽（新增／更新／不變／略過與原因）→ 確認寫入。
// - 檔案只在瀏覽器以 SheetJS 解析，不上傳、不存 storage；送到 server 的只有解析後的列。
// - 非 hr 使用者：敏感欄位在送出前就丟棄（stripPrivate），預覽標示「需要人事權限」。
// - 預覽畫面不顯示敏感欄位明文（hr 也只看到遮罩值）。
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IMPORT_STATUS_LABELS,
  IMPORT_TARGET_LABELS,
  BASIC_TARGETS,
  PLAN_ACTION_LABELS,
  buildImportPlan,
  collectSheetKeys,
  defaultMapping,
  detectHeaderRow,
  mappingError,
  parseRows,
  stripPrivate,
  summarizePlan,
  type ColumnMapping,
  type ExistingEmployee,
  type ImportStatusMode,
  type ImportTarget,
  type PlanRow,
} from "@/lib/employees/import";
import { employeeRolesText } from "@/lib/employees/normalize";
import {
  PRIVATE_FIELDS,
  PRIVATE_FIELD_LABELS,
  maskPrivateValue,
} from "@/lib/employees/private";
import { taipeiToday } from "@/lib/employees/status";
import {
  IMPORT_FILE_ACCEPT,
  IMPORT_FILE_MAX_BYTES,
  readWorkbook,
  type SheetData,
} from "@/lib/employees/sheet";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { importEmployeesAction, type ImportResult } from "./actions";

const TARGETS: ImportTarget[] = [...BASIC_TARGETS, ...PRIVATE_FIELDS];
const STATUS_MODES: ImportStatusMode[] = [
  "keep",
  "active",
  "inactive",
  "compare",
];

const ACTION_TONE: Record<PlanRow["action"], string> = {
  insert: "bg-primary/10 text-primary-deep",
  update: "bg-sky-50 text-sky-700",
  unchanged: "bg-gray-100 text-gray-500",
  skip: "bg-amber-50 text-amber-700",
};

async function loadSheetJS() {
  const [XLSX, cptable] = await Promise.all([
    import("xlsx"),
    import("xlsx/dist/cpexcel.full"),
  ]);
  // 舊版 xls（BIFF5）與 Big5 編碼的 csv 需要 codepage 表才能正確讀中文。
  XLSX.set_cptable(cptable);
  return XLSX;
}

export function EmployeeImport({
  existing,
  canWritePrivate,
}: {
  existing: ExistingEmployee[];
  canWritePrivate: boolean;
}) {
  const router = useRouter();
  const [askConfirm, confirmDialog] = useConfirm();
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(-1);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [status, setStatus] = useState<ImportStatusMode>("keep");
  const [compareIdx, setCompareIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const grid = useMemo(() => sheets[sheetIdx]?.grid ?? [], [sheets, sheetIdx]);
  const headers = headerRow >= 0 ? (grid[headerRow] ?? []) : [];

  function selectSheet(idx: number, list: SheetData[] = sheets) {
    const g = list[idx]?.grid ?? [];
    const h = detectHeaderRow(g);
    setSheetIdx(idx);
    setHeaderRow(h);
    setMapping(h >= 0 ? defaultMapping(g[h] ?? []) : []);
    setResult(null);
  }

  function changeHeaderRow(row: number) {
    setHeaderRow(row);
    setMapping(row >= 0 ? defaultMapping(grid[row] ?? []) : []);
    setResult(null);
  }

  async function onFile(file: File | undefined) {
    setError(null);
    setResult(null);
    setSheets([]);
    setFileName(null);
    if (!file) return;
    if (file.size > IMPORT_FILE_MAX_BYTES) {
      setError("檔案太大（上限 5 MB），請確認是否選對檔案。");
      return;
    }
    setBusy(true);
    try {
      const XLSX = await loadSheetJS();
      const parsed = readWorkbook(XLSX, await file.arrayBuffer());
      if (parsed.length === 0) {
        setError("檔案中沒有工作表。");
        return;
      }
      setFileName(file.name);
      setSheets(parsed);
      setCompareIdx(null);
      selectSheet(0, parsed);
    } catch {
      setError("無法讀取此檔案，請確認是 xls、xlsx 或 csv 格式。");
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(
    () => (headerRow >= 0 ? parseRows(grid, headerRow, mapping) : []),
    [grid, headerRow, mapping],
  );
  const compareKeys = useMemo(
    () =>
      status === "compare" && compareIdx !== null && sheets[compareIdx]
        ? collectSheetKeys(sheets[compareIdx].grid)
        : null,
    [status, compareIdx, sheets],
  );
  const mapErr = headerRow >= 0 ? mappingError(mapping) : null;
  const compareErr =
    status === "compare"
      ? compareIdx === null
        ? "請選擇比對用的工作表。"
        : !compareKeys
          ? "比對用的工作表找不到含「員工編號」的標題列。"
          : null
      : null;
  const plan = useMemo(
    () =>
      mapErr || compareErr
        ? []
        : buildImportPlan(
            rows,
            existing,
            { status, compareKeys, canWritePrivate },
            taipeiToday(),
          ),
    [rows, existing, status, compareKeys, canWritePrivate, mapErr, compareErr],
  );
  const summary = summarizePlan(plan);
  const writable = summary.insert + summary.update + summary.privateRows;

  async function submit() {
    setError(null);
    const ok = await askConfirm({
      title: "確定匯入？",
      message: `新增 ${summary.insert} 位、更新 ${summary.update} 位、略過 ${summary.skip} 列${
        canWritePrivate && summary.privateRows > 0
          ? `；${summary.privateRows} 位的敏感資料將加密寫入`
          : ""
      }。`,
      confirmLabel: "匯入",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await importEmployeesAction({
        rows: canWritePrivate ? rows : stripPrivate(rows),
        status,
        compareKeys:
          status === "compare" && compareKeys
            ? {
                codes: [...compareKeys.codes],
                names: [...compareKeys.names],
              }
            : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      router.refresh();
    } catch (e) {
      setError((e as Error)?.message || "匯入失敗，請確認網路後再試一次。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      <section className="border-border flex flex-col gap-4 rounded-xl border bg-white p-5">
        <label className="flex flex-col gap-1.5 text-[14px]">
          <span className="text-ink font-medium">1. 選擇檔案</span>
          <input
            type="file"
            accept={IMPORT_FILE_ACCEPT}
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-[14px]"
          />
          <span className="text-text-muted text-[12px]">
            {fileName
              ? `已讀取：${fileName}（${sheets.length} 個工作表）`
              : "支援 xls、xlsx、csv；檔案不會上傳。"}
          </span>
        </label>
        {!canWritePrivate && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            你沒有人事權限：身份證號、戶籍地址、聯絡人、婚姻、學歷、經歷等敏感欄位不會送出，
            只匯入員工編號、姓名、職務、電話等基本資料。
          </p>
        )}

        {sheets.length > 0 && (
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-[200px] flex-col gap-1 text-[13px]">
              <span className="text-text-muted">2. 工作表</span>
              <select
                className={ERP_SELECT}
                value={sheetIdx}
                onChange={(e) => selectSheet(Number(e.target.value))}
              >
                {sheets.map((s, i) => (
                  <option key={`${i}-${s.name}`} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-[160px] flex-col gap-1 text-[13px]">
              <span className="text-text-muted">標題列（第幾列）</span>
              <input
                type="number"
                min={1}
                max={grid.length || 1}
                className={ERP_INPUT}
                value={headerRow >= 0 ? headerRow + 1 : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  changeHeaderRow(
                    Number.isInteger(n) && n >= 1 && n <= grid.length
                      ? n - 1
                      : -1,
                  );
                }}
              />
            </label>
          </div>
        )}
        {sheets.length > 0 && headerRow < 0 && (
          <p role="alert" className="text-[14px] text-red-600">
            找不到含「員工編號」的標題列，請手動輸入標題列的列號。
          </p>
        )}
      </section>

      {headerRow >= 0 && (
        <section className="border-border flex flex-col gap-3 rounded-xl border bg-white p-5">
          <h2 className="text-ink text-[14px] font-medium">3. 欄位對應</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {headers.map((h, idx) => (
              <label key={idx} className="flex flex-col gap-1 text-[13px]">
                <span className="text-text-muted">
                  第 {idx + 1} 欄：{h || "（無標題）"}
                </span>
                <select
                  className={ERP_SELECT}
                  value={mapping[idx] ?? ""}
                  onChange={(e) => {
                    const v = (e.target.value || null) as ImportTarget | null;
                    setMapping((m) => {
                      const next = [...m];
                      while (next.length <= idx) next.push(null);
                      next[idx] = v;
                      return next;
                    });
                    setResult(null);
                  }}
                >
                  <option value="">不匯入</option>
                  {TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {IMPORT_TARGET_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {mapErr && (
            <p role="alert" className="text-[14px] text-red-600">
              {mapErr}
            </p>
          )}

          <h2 className="text-ink mt-3 text-[14px] font-medium">
            4. 在職／離職
          </h2>
          <div className="flex flex-col gap-2 text-[14px]">
            {STATUS_MODES.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="import-status"
                  checked={status === m}
                  onChange={() => {
                    setStatus(m);
                    setResult(null);
                  }}
                />
                {IMPORT_STATUS_LABELS[m]}
              </label>
            ))}
            {status === "compare" && (
              <label className="ml-6 flex max-w-[320px] flex-col gap-1 text-[13px]">
                <span className="text-text-muted">
                  在職名單工作表（在此表中的員工 → 在職；其餘 → 離職）
                </span>
                <select
                  className={ERP_SELECT}
                  value={compareIdx ?? ""}
                  onChange={(e) =>
                    setCompareIdx(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                >
                  <option value="">請選擇</option>
                  {sheets.map((s, i) =>
                    i === sheetIdx ? null : (
                      <option key={`${i}-${s.name}`} value={i}>
                        {s.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            {compareErr && (
              <p role="alert" className="text-[14px] text-red-600">
                {compareErr}
              </p>
            )}
          </div>
        </section>
      )}

      {plan.length > 0 && (
        <section className="border-border flex flex-col gap-3 rounded-xl border bg-white p-5">
          <h2 className="text-ink text-[14px] font-medium">5. 預覽</h2>
          <p className="text-ink text-[14px]">
            新增 {summary.insert} 位、更新 {summary.update} 位、不變{" "}
            {summary.unchanged} 位、略過 {summary.skip} 列
            {summary.noRole > 0 &&
              `；${summary.noRole} 位職務對不到角色（無角色，不會出現在選取器）`}
            {canWritePrivate
              ? summary.privateRows > 0 &&
                `；${summary.privateRows} 位有敏感資料（加密寫入，內容相同不重寫）`
              : summary.privateDropped > 0 &&
                `；${summary.privateDropped} 位的敏感欄位需要人事權限，不會匯入`}
            。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-text-muted text-left">
                <tr className="border-border border-b">
                  <th className="py-2 pr-3 font-medium">列</th>
                  <th className="py-2 pr-3 font-medium">動作</th>
                  <th className="py-2 pr-3 font-medium">編號</th>
                  <th className="py-2 pr-3 font-medium">姓名</th>
                  <th className="py-2 pr-3 font-medium">職務 → 角色</th>
                  <th className="py-2 pr-3 font-medium">狀態</th>
                  <th className="py-2 pr-3 font-medium">敏感資料</th>
                  <th className="py-2 font-medium">說明</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((r) => (
                  <tr key={r.line} className="border-border border-b align-top">
                    <td className="py-2 pr-3 font-mono">{r.line}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${ACTION_TONE[r.action]}`}
                      >
                        {PLAN_ACTION_LABELS[r.action]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{r.code ?? "—"}</td>
                    <td className="py-2 pr-3">{r.name || "—"}</td>
                    <td className="py-2 pr-3">
                      {r.title ?? "—"} →{" "}
                      {r.noRole ? (
                        <span className="text-amber-700">無角色</span>
                      ) : (
                        employeeRolesText(r.roles)
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.active === null ? "—" : r.active ? "在職" : "離職"}
                    </td>
                    <td className="py-2 pr-3">
                      {r.privateDropped ? (
                        <span className="text-amber-700">需要人事權限</span>
                      ) : (
                        <PrivateSummary row={r} />
                      )}
                    </td>
                    <td className="py-2">
                      {[
                        r.reason,
                        r.matchedBy === "code" && "依員工編號對到既有員工",
                        r.matchedBy === "name" && "依姓名對到既有員工",
                        ...r.warnings,
                      ]
                        .filter(Boolean)
                        .join("；") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || writable === 0}
              onClick={submit}
              className="bg-primary hover:bg-primary-deep h-11 rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "匯入中…" : "確認匯入"}
            </button>
            {writable === 0 && (
              <span className="text-text-muted text-[13px]">
                沒有需要寫入的資料。
              </span>
            )}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}

      {result && (
        <section
          role="status"
          className="border-border flex flex-col gap-2 rounded-xl border bg-white p-5 text-[14px]"
        >
          <h2 className="text-ink font-bold">匯入完成</h2>
          <p>
            新增 {result.inserted} 位、更新 {result.updated} 位
            {result.privateFields !== null &&
              `；敏感資料寫入 ${result.privateFields} 個欄位`}
            。
          </p>
          {result.failures.length > 0 && (
            <ul className="list-disc pl-5 text-red-600">
              {result.failures.map((f) => (
                <li key={f.line}>
                  第 {f.line} 列：{f.error}
                </li>
              ))}
            </ul>
          )}
          {result.privateError && (
            <p className="text-red-600">
              敏感資料未寫入：{result.privateError}
            </p>
          )}
          <Link
            href="/admin/employees?status=all"
            className="text-primary-deep font-medium"
          >
            查看員工列表 →
          </Link>
        </section>
      )}
    </div>
  );
}

/** 敏感欄位摘要（只顯示遮罩值）。 */
function PrivateSummary({ row }: { row: PlanRow }) {
  const items = PRIVATE_FIELDS.filter((f) => row.private[f]);
  if (items.length === 0) return <>—</>;
  return (
    <span className="text-text-muted flex flex-col gap-0.5">
      {items.map((f) => (
        <span key={f} className="whitespace-nowrap">
          {PRIVATE_FIELD_LABELS[f]}：{maskPrivateValue(f, row.private[f])}
        </span>
      ))}
    </span>
  );
}
