"use client";
// 拍照辨識的審核頁：拍照/選檔 → 壓縮 → 上傳原圖（稽核）→ AI 擷取 → 分流成兩張卡
// → 人工確認/修改/搬列 → 一次匯入。
//
// 舊紙本會把「過濾系統（乾燥機）卡」與「空壓機卡」混寫在同一張紙上（見 #158），
// 因此辨識完成後以兩個分頁並排呈現兩張草稿卡，並讓員工把誤判的列搬到另一張卡。
//
// 表單設計要點：
// - 兩張卡的分頁都「一直掛在 DOM 上」，只用 CSS 隱藏未選取的那個。若改成條件渲染，
//   切分頁會把非受控 input 卸載，員工改過的值就沒了。
// - 每一列同時渲染「空壓機欄位」與「過濾卡欄位」兩組輸入，各自隱藏。搬列只是改
//   React state 裡的歸屬，輸入框不會被卸載 → 搬來搬去都不掉資料。
// - 列的歸屬 / 刪除狀態放 React state，欄位值仍走 FormData（input name 以「原始列
//   索引」編號，索引恆定不重排）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Trash2, Undo2 } from "lucide-react";
import { compressImage } from "@/lib/admin/image-compress";
import { uploadMediaDirect } from "@/lib/admin/upload-client";
import { CardBasicFields } from "./CardBasicForm";
import { ColumnsEditor, type ColumnDraft } from "./ColumnsEditor";
import { MinguoDateInput } from "./MinguoDateInput";
import { SERVICE_TYPE_SELECT_CLASS, ServiceTypeOptions } from "./RecordForm";
import { parseServiceType } from "@/lib/admin/maintenance-service-type";
import {
  extractCardFromImageAction,
  commitImportAction,
  type CardMatch,
  type CommitCardBasic,
  type CommitFilterRecord,
  type ExtractResult,
} from "@/app/admin/(protected)/maintenance/actions";
import type { RecordPayload } from "@/lib/admin/maintenance-normalize";
import {
  filterCellText,
  type BelongsTo,
  type CardDraft,
  type RecordDraft,
} from "@/lib/admin/maintenance-card-split";

type Ok = Extract<ExtractResult, { ok: true }>;

/** 空壓機卡專屬欄位（日期 / 維護員 為兩張卡共用，另外渲染）。 */
const COMPRESSOR_FIELDS: { name: keyof RecordPayload; label: string }[] = [
  { name: "hours", label: "時數" },
  { name: "oil", label: "專用油" },
  { name: "oil_filter", label: "機油濾清器" },
  { name: "air_filter", label: "空氣濾清器" },
  { name: "oil_separator", label: "油氣分離器" },
  { name: "inverter", label: "變頻器" },
  { name: "filter_system", label: "過濾系統" },
  { name: "note", label: "備註" },
];

// 過濾卡沒有這些欄。搬到過濾卡的列若不把它們的原文併進備註，辨識到的手寫內容會靜靜消失
// （樣態 A 整張是過濾卡時，每一列的時數與專用油都是這個情況）。
const CARRIED_TO_FILTER_NOTE = COMPRESSOR_FIELDS.filter(
  (f) =>
    f.name !== "inverter" && f.name !== "filter_system" && f.name !== "note",
);

const INPUT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";
const FIELD_CLASS = "flex flex-col gap-1.5";

/** 第 i 列、欄位 f 的 input name。i 為原始列索引，永遠不重排。 */
function rf(i: number, f: string): string {
  return `records[${i}][${f}]`;
}

function readText(fd: FormData, name: string): string | null {
  const v = String(fd.get(name) ?? "").trim();
  return v === "" ? null : v;
}

/** 讀一張卡的表頭欄位（namePrefix 對應 CardBasicFields 的前綴）。 */
function readBasic(fd: FormData, prefix: string): CommitCardBasic {
  const g = (n: string) => String(fd.get(`${prefix}${n}`) ?? "").trim();
  return {
    customer_name: g("customer_name"),
    customer_code: g("customer_code"),
    serial_no: g("serial_no"),
    machine_no: g("machine_no"),
    location: g("location"),
    purchased_at: g("purchased_at"),
    model: g("model"),
    horsepower: g("horsepower"),
    voltage: g("voltage"),
    filter_spec: g("filter_spec"),
    drain_spec: g("drain_spec"),
  };
}

/** 核對畫面用的耗材欄：key 供 input name 用（新欄用本地 key，既有欄用 column id）。 */
interface ReviewColumn {
  key: string;
  label: string;
}

interface RowState {
  /** 原始列索引，等同 input name 的編號。 */
  index: number;
  belongsTo: BelongsTo;
  dropped: boolean;
}

// ── 一列維護紀錄 ──────────────────────────────────────────────────

function RecordRow({
  row,
  draft,
  columns,
  visible,
  hasOtherCard,
  onMove,
  onToggleDrop,
}: {
  row: RowState;
  draft: RecordDraft;
  columns: ReviewColumn[];
  visible: boolean;
  hasOtherCard: boolean;
  onMove: () => void;
  onToggleDrop: () => void;
}) {
  const i = row.index;
  const isFilter = row.belongsTo === "filter";
  // 過濾卡只有日期 / 維護員 / 動態耗材欄 / 備註，其餘欄位在這張卡上沒有落腳處，
  // 因此把該列所有辨識到的原文都併進備註當預設值（員工再自行分配到耗材欄或刪減）。
  const filterNote = [
    filterCellText(draft),
    ...CARRIED_TO_FILTER_NOTE.map((f) =>
      draft[f.name] ? `${f.label}${draft[f.name]}` : "",
    ),
    draft.note ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset
      className={`border-border rounded-lg border p-4 ${visible ? "" : "hidden"} ${
        row.dropped ? "bg-surface-muted opacity-60" : ""
      }`}
    >
      <legend className="text-text-muted px-2 text-[13px]">
        第 {i + 1} 列{row.dropped ? "（不匯入）" : ""}
      </legend>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onMove}
          className="border-primary text-primary hover:bg-primary inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[14px] font-semibold hover:text-white"
        >
          <ArrowLeftRight size={15} aria-hidden="true" />
          {isFilter
            ? "搬到空壓機卡"
            : hasOtherCard
              ? "搬到過濾系統卡"
              : "搬到過濾系統卡（會建立過濾卡）"}
        </button>
        <button
          type="button"
          onClick={onToggleDrop}
          className="border-border text-text-muted hover:bg-surface-muted inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[14px]"
        >
          {row.dropped ? (
            <>
              <Undo2 size={15} aria-hidden="true" />
              恢復此列
            </>
          ) : (
            <>
              <Trash2 size={15} aria-hidden="true" />
              不匯入此列
            </>
          )}
        </button>
      </div>

      {/* 兩張卡共用：日期 / 服務類型 / 維護員。搬列時不需要重打。 */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className={FIELD_CLASS}>
          <label className="text-ink text-[14px] font-medium">日期</label>
          <MinguoDateInput
            name={rf(i, "service_date")}
            defaultIso={draft.service_date ?? undefined}
          />
        </div>
        <div className={FIELD_CLASS}>
          <label
            htmlFor={rf(i, "service_type")}
            className="text-ink text-[14px] font-medium"
          >
            服務類型
          </label>
          <select
            id={rf(i, "service_type")}
            name={rf(i, "service_type")}
            defaultValue={draft.service_type ?? ""}
            className={SERVICE_TYPE_SELECT_CLASS}
          >
            <ServiceTypeOptions />
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <label
            htmlFor={rf(i, "technician")}
            className="text-ink text-[14px] font-medium"
          >
            維護員
          </label>
          <input
            id={rf(i, "technician")}
            name={rf(i, "technician")}
            type="text"
            defaultValue={draft.technician ?? ""}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* 空壓機卡欄位（歸屬過濾卡時隱藏，但保留在 DOM 中不掉值）。 */}
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
          isFilter ? "hidden" : ""
        }`}
      >
        {COMPRESSOR_FIELDS.map((f) => (
          <div key={f.name} className={FIELD_CLASS}>
            <label
              htmlFor={rf(i, f.name)}
              className="text-ink text-[14px] font-medium"
            >
              {f.label}
            </label>
            <input
              id={rf(i, f.name)}
              name={rf(i, f.name)}
              type="text"
              defaultValue={draft[f.name] ?? ""}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </div>

      {/* 過濾系統卡欄位：動態耗材欄 + 備註（預設帶入辨識到的過濾系統欄原文）。 */}
      <div className={isFilter ? "" : "hidden"}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {columns.map((c) => (
            <div key={c.key} className={FIELD_CLASS}>
              <label
                htmlFor={rf(i, `col][${c.key}`)}
                className="text-ink text-[14px] font-medium"
              >
                {c.label || "（未命名欄位）"}
              </label>
              <input
                id={rf(i, `col][${c.key}`)}
                name={rf(i, `col][${c.key}`)}
                type="text"
                className={INPUT_CLASS}
              />
            </div>
          ))}
          <div className={`${FIELD_CLASS} sm:col-span-2 lg:col-span-3`}>
            <label
              htmlFor={rf(i, "f_note")}
              className="text-ink text-[14px] font-medium"
            >
              備註
              <span className="text-text-muted ml-2 text-[13px] font-normal">
                預設為辨識到的「過濾系統 /
                變頻器」欄原文；分配到上面的耗材欄後可自行刪減
              </span>
            </label>
            <input
              id={rf(i, "f_note")}
              name={rf(i, "f_note")}
              type="text"
              defaultValue={filterNote}
              className={INPUT_CLASS}
            />
          </div>
        </div>
        {columns.length === 0 && (
          <p className="mt-3 text-[14px] text-amber-700">
            這張過濾卡還沒有耗材欄位，請到「過濾系統卡」分頁的「耗材欄位」新增；
            未新增也可以只存日期 / 維護員 / 備註。
          </p>
        )}
      </div>
    </fieldset>
  );
}

// ── 已辨識完成的核對表單 ──────────────────────────────────────────

function ReviewForm({
  result,
  preview,
}: {
  result: Ok;
  preview: string | null;
}) {
  const router = useRouter();
  const { cards, match, filterMatch } = result;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [tab, setTab] = useState<BelongsTo>(
    cards.compressor ? "compressor" : "filter",
  );
  const [rows, setRows] = useState<RowState[]>(() =>
    cards.rows.map((r, index) => ({
      index,
      belongsTo: r.belongs_to,
      dropped: false,
    })),
  );
  const [compressorCard, setCompressorCard] = useState<CardDraft | null>(
    cards.compressor,
  );
  const [filterCard, setFilterCard] = useState<CardDraft | null>(cards.filter);
  const [importCompressor, setImportCompressor] = useState(
    cards.compressor !== null,
  );
  const [importFilter, setImportFilter] = useState(
    result.importFilterByDefault,
  );
  // ColumnsEditor 回報的耗材欄清單（只在「新建過濾卡」時使用）。
  const [editorColumns, setEditorColumns] = useState<ColumnDraft[]>([]);

  // 附加到既有過濾卡時，欄位以該卡既有定義為準（key = column id，與後端對應）。
  const columns: ReviewColumn[] = filterMatch
    ? filterMatch.columns.map((c) => ({ key: c.id, label: c.label }))
    : editorColumns.map((c) => ({ key: c.key, label: c.label }));

  /** 以另一張卡的表頭為底，開一張空白草稿卡（同一張紙 → 同一個客戶 / 地點）。 */
  function blankCardFrom(base: CardDraft | null): CardDraft {
    return {
      basic: {
        customer_name: base?.basic.customer_name ?? "",
        customer_code: base?.basic.customer_code ?? "",
        serial_no: "",
        machine_no: "",
        location: base?.basic.location ?? "",
        purchased_at: "",
        model: "",
        horsepower: "",
        voltage: "",
        filter_spec: "",
        drain_spec: "",
      },
      records: [],
      columns: [],
    };
  }

  /** 沒有過濾卡草稿時（樣態 C）現場補一張空白的，讓員工可以把列搬過去。 */
  function ensureFilterCard() {
    if (filterCard) return;
    setFilterCard(blankCardFrom(compressorCard));
    setImportFilter(true);
  }

  /** 反向：整張判成過濾卡（樣態 A）但其中有列其實屬空壓機時，現場補一張空壓機卡。 */
  function ensureCompressorCard() {
    if (compressorCard) return;
    setCompressorCard(blankCardFrom(filterCard));
    setImportCompressor(true);
  }

  function moveRow(index: number) {
    const current = rows.find((r) => r.index === index);
    if (!current) return;
    if (current.belongsTo === "compressor") ensureFilterCard();
    else ensureCompressorCard();
    setRows((prev) =>
      prev.map((r) =>
        r.index === index
          ? {
              ...r,
              belongsTo: r.belongsTo === "compressor" ? "filter" : "compressor",
            }
          : r,
      ),
    );
  }

  function toggleDrop(index: number) {
    setRows((prev) =>
      prev.map((r) => (r.index === index ? { ...r, dropped: !r.dropped } : r)),
    );
  }

  const compressorCount = rows.filter(
    (r) => !r.dropped && r.belongsTo === "compressor",
  ).length;
  const filterCount = rows.filter(
    (r) => !r.dropped && r.belongsTo === "filter",
  ).length;

  async function onSave(fd: FormData) {
    setBusy(true);
    setError(null);
    try {
      const useCompressor = importCompressor && compressorCard !== null;
      const useFilter = importFilter && filterCard !== null;
      if (!useCompressor && !useFilter) {
        setError("請至少勾選一張要匯入的卡。");
        return;
      }

      const compressorRecords: RecordPayload[] = rows
        .filter((r) => !r.dropped && r.belongsTo === "compressor")
        .map((r) => ({
          service_date: readText(fd, rf(r.index, "service_date")),
          hours: readText(fd, rf(r.index, "hours")),
          oil: readText(fd, rf(r.index, "oil")),
          oil_filter: readText(fd, rf(r.index, "oil_filter")),
          air_filter: readText(fd, rf(r.index, "air_filter")),
          oil_separator: readText(fd, rf(r.index, "oil_separator")),
          inverter: readText(fd, rf(r.index, "inverter")),
          filter_system: readText(fd, rf(r.index, "filter_system")),
          technician: readText(fd, rf(r.index, "technician")),
          note: readText(fd, rf(r.index, "note")),
          service_type: parseServiceType(
            readText(fd, rf(r.index, "service_type")),
          ),
        }))
        // service_type 不算「有填內容」：只選了類型卻整列空白的仍視為空列丟棄。
        .filter((r) =>
          Object.entries(r).some(
            ([k, v]) => k !== "service_type" && v !== null,
          ),
        );

      const filterRecords: CommitFilterRecord[] = rows
        .filter((r) => !r.dropped && r.belongsTo === "filter")
        .map((r) => ({
          service_date: readText(fd, rf(r.index, "service_date")),
          technician: readText(fd, rf(r.index, "technician")),
          note: readText(fd, rf(r.index, "f_note")),
          service_type: parseServiceType(
            readText(fd, rf(r.index, "service_type")),
          ),
          values: columns.map((c) =>
            readText(fd, rf(r.index, `col][${c.key}`)),
          ),
        }))
        .filter(
          (r) =>
            r.service_date !== null ||
            r.technician !== null ||
            r.note !== null ||
            r.values.some((v) => v !== null),
        );

      const out = await commitImportAction({
        draftId: result.draftId,
        compressor: useCompressor
          ? {
              machineId: match?.id ?? null,
              basic: match ? emptyBasicFor(match) : readBasic(fd, ""),
              records: compressorRecords,
            }
          : null,
        filter: useFilter
          ? {
              machineId: filterMatch?.id ?? null,
              basic: filterMatch
                ? emptyBasicFor(filterMatch)
                : readBasic(fd, "f_"),
              columns: columns.map((c) => c.label),
              records: filterRecords,
            }
          : null,
      });
      if (!out.ok) {
        setError(out.error);
        return;
      }
      router.push(`/admin/maintenance/${out.machineId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (active: boolean) =>
    `h-11 rounded-lg px-4 text-[15px] font-semibold ${
      active
        ? "bg-primary text-white"
        : "border-border text-text-muted hover:bg-surface-muted border"
    }`;

  return (
    // noValidate：未選取的分頁是用 CSS 隱藏的（見檔頭），其中 CardBasicFields 的
    // required 欄位若被瀏覽器驗證，會因為 display:none 無法 focus 而讓表單「按了沒反應」。
    // 必填（機號 / 客戶名稱）改由 insertImportedMachine 在 server 端驗，丟出可讀訊息。
    <form action={onSave} noValidate className="flex flex-col gap-6">
      {preview && (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="focus:ring-primary self-start rounded-lg focus:ring-2 focus:outline-none"
          title="點擊放大"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 預覽是 data URL，非靜態資產。 */}
          <img
            src={preview}
            alt="保養卡（點擊放大）"
            className="max-h-64 cursor-zoom-in rounded-lg border"
          />
        </button>
      )}

      {/* 放大檢視：點擊任意處或按鈕關閉。核對 AI 擷取欄位與手寫原稿時用。 */}
      {zoomed && preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="保養卡放大檢視"
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 預覽是 data URL，非靜態資產。 */}
          <img
            src={preview}
            alt="保養卡放大"
            className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="關閉放大檢視"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[20px] font-bold text-black"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-surface-muted rounded-lg p-3 text-[14px]">
        {cards.kind === "mixed"
          ? "這張紙同時寫了空壓機與過濾系統（乾燥機）的內容，已分成兩張草稿卡。請逐張核對，判斷錯的列可用「搬到另一張卡」修正。"
          : cards.kind === "filter"
            ? "機號的位置寫的是過濾器型號，判定整張是「過濾系統保養紀錄卡」，沒有產生空壓機卡。"
            : "判定為單純的空壓機保養紀錄卡。若這張紙其實也有乾燥機的維護，可把該列搬到過濾系統卡。"}
      </div>

      {/* 分頁切換 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("compressor")}
          className={tabBtn(tab === "compressor")}
        >
          空壓機保養紀錄卡（{compressorCount}）
        </button>
        <button
          type="button"
          onClick={() => setTab("filter")}
          className={tabBtn(tab === "filter")}
        >
          過濾系統保養紀錄卡（{filterCount}）
        </button>
      </div>

      {/* ── 空壓機卡分頁 ── */}
      <section className={tab === "compressor" ? "" : "hidden"}>
        {compressorCard ? (
          <>
            <label className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <input
                type="checkbox"
                checked={importCompressor}
                onChange={(e) => setImportCompressor(e.target.checked)}
                className="h-4 w-4"
              />
              匯入這張空壓機卡
            </label>
            <div className="bg-surface-muted mb-4 rounded-lg p-3 text-[14px]">
              {match
                ? `比對到既有卡：機號 ${match.serial_no}／客戶 ${match.customer_name}。將附加 ${compressorCount} 列維護紀錄。`
                : "未比對到既有卡，將建立新卡。請確認基本資訊。"}
            </div>
            {!match && <CardBasicFields values={compressorCard.basic} />}
          </>
        ) : (
          <p className="border-border text-text-muted rounded-xl border border-dashed p-6 text-center text-[14px]">
            這張照片沒有空壓機的內容。若判定有誤，到「過濾系統保養紀錄卡」分頁把該列搬回來。
          </p>
        )}
      </section>

      {/* ── 過濾系統卡分頁 ── */}
      <section className={tab === "filter" ? "" : "hidden"}>
        {filterCard ? (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-[15px] font-semibold">
              <input
                type="checkbox"
                checked={importFilter}
                onChange={(e) => setImportFilter(e.target.checked)}
                className="h-4 w-4"
              />
              匯入這張過濾系統卡
            </label>
            <div className="bg-surface-muted rounded-lg p-3 text-[14px]">
              {filterMatch
                ? `比對到既有過濾卡：${filterMatch.serial_no}／客戶 ${filterMatch.customer_name}。將附加 ${filterCount} 列維護紀錄，耗材欄沿用該卡既有定義。`
                : "未比對到既有過濾卡，將建立新卡。請確認表頭與耗材欄位。"}
            </div>
            {!filterMatch && (
              <>
                <CardBasicFields
                  values={filterCard.basic}
                  cardType="filter"
                  namePrefix="f_"
                />
                <ColumnsEditor
                  initial={filterCard.columns.map((label) => ({
                    id: null,
                    label,
                  }))}
                  onChange={setEditorColumns}
                />
              </>
            )}
          </div>
        ) : (
          <div className="border-border rounded-xl border border-dashed p-6 text-center">
            <p className="text-text-muted mb-3 text-[14px]">
              這張照片沒有判定出過濾系統（乾燥機）的內容。
            </p>
            <button
              type="button"
              onClick={ensureFilterCard}
              className="border-primary text-primary hover:bg-primary h-10 rounded-lg border px-4 text-[14px] font-semibold hover:text-white"
            >
              這張卡也有過濾系統 → 建立過濾系統卡草稿
            </button>
          </div>
        )}
      </section>

      {/* 兩張卡共用同一份列清單；非本分頁的列以 CSS 隱藏，不卸載、不掉值。 */}
      <section>
        <h2 className="text-ink mb-3 text-[16px] font-bold">
          維護紀錄（
          {tab === "compressor" ? compressorCount : filterCount}）
        </h2>
        <div className="flex flex-col gap-6">
          {cards.rows.map((draft, index) => {
            const row = rows[index];
            return (
              <RecordRow
                key={index}
                row={row}
                draft={draft}
                columns={columns}
                visible={row.belongsTo === tab}
                hasOtherCard={
                  row.belongsTo === "compressor"
                    ? filterCard !== null
                    : compressorCard !== null
                }
                onMove={() => moveRow(index)}
                onToggleDrop={() => toggleDrop(index)}
              />
            );
          })}
          {(tab === "compressor" ? compressorCount : filterCount) === 0 && (
            <p className="border-border text-text-muted rounded-xl border border-dashed p-6 text-center text-[14px]">
              這張卡目前沒有維護紀錄。
            </p>
          )}
        </div>
      </section>

      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "儲存中…" : "確認並匯入"}
      </button>
    </form>
  );
}

/** 附加到既有卡時不會用到表頭欄位，但型別要求要有；用比對到的機號填最小值。 */
function emptyBasicFor(m: CardMatch): CommitCardBasic {
  return {
    customer_name: m.customer_name,
    customer_code: "",
    serial_no: m.serial_no,
    machine_no: "",
    location: "",
    purchased_at: "",
    model: "",
    horsepower: "",
    voltage: "",
    filter_spec: "",
    drain_spec: "",
  };
}

// ── 上傳 / 辨識入口 ───────────────────────────────────────────────

export function ImportReview() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Ok | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await compressImage(file);
      setPreview(img.dataUrl);

      // 原圖上傳 Storage（稽核）。以壓縮後 JPEG 直傳（沿用簽名直傳 helper）。
      const blob = await (await fetch(img.dataUrl)).blob();
      const jpg = new File([blob], "card.jpg", { type: "image/jpeg" });
      const uploaded = await uploadMediaDirect(jpg, "maintenance");
      const photoPath = uploaded.ok ? uploaded.path : "";

      const res = await extractCardFromImageAction({
        imageBase64: img.base64,
        mimeType: img.mimeType,
        photoPath,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <label className="border-border hover:bg-surface-muted flex h-40 cursor-pointer items-center justify-center rounded-xl border border-dashed text-[15px]">
          {busy ? "辨識中…" : "點此拍照 / 選擇保養卡照片"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />
        </label>
        {error && <p className="text-[14px] text-red-600">{error}</p>}
      </div>
    );
  }

  // result 一旦有值就不再回到上傳畫面，ReviewForm 只會掛載一次，
  // 其 useState 初始值直接吃這份分流結果即可。
  return <ReviewForm result={result} preview={preview} />;
}
