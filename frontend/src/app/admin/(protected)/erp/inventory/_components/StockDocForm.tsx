"use client";
// 調撥單 T / 盤點調整單 A 編輯表單（受控）。儲存草稿、儲存並過帳；錯誤就地顯示並保留輸入。
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DocumentHeaderFields } from "@/components/erp/DocumentHeaderFields";
import { DocumentLinesEditor } from "@/components/erp/DocumentLinesEditor";
import type {
  DraftDocument,
  DraftDocumentHeader,
  DraftLine,
  ErpResult,
  ItemOption,
  SerialOption,
  WarehouseOption,
} from "@/lib/erp/types";
import type { StockDocType } from "../_lib/inventory-logic";
import { PRIMARY_LINK, SECONDARY_LINK } from "./InventoryShell";

type Result = { ok: true } | { ok: false; error: string };

const HINT: Record<StockDocType, string> = {
  T: "由來源倉移至目的倉。追蹤機號的品項需勾選來源倉中的在庫機號，機號數需等於數量。",
  A: "數量正數為盤盈、負數為盤虧；每個品項行都要填寫調整原因。追蹤機號的品項：盤盈輸入新機號，盤虧勾選該倉在庫機號。",
};

export function StockDocForm({
  docType,
  initial,
  items,
  warehouses,
  serials,
  basePath,
  saveAction,
  postAction,
}: {
  docType: StockDocType;
  initial: DraftDocument;
  items: ItemOption[];
  warehouses: WarehouseOption[];
  /** 全部倉庫的在庫機號（依目前倉庫在 client 端過濾）。 */
  serials: SerialOption[];
  basePath: string;
  saveAction: (input: DraftDocument) => Promise<ErpResult<{ id: string }>>;
  postAction: (id: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DraftDocument>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { lines, ...header } = doc;
  const warehouseSerials = serials.filter(
    (s) => s.status === "in_stock" && s.warehouse_id === doc.warehouse_id,
  );

  function onHeaderChange(next: DraftDocumentHeader) {
    setDoc((prev) => {
      let nextLines = prev.lines;
      if (next.warehouse_id !== prev.warehouse_id) {
        // 換倉後原選機號不在新倉，清掉避免誤送。
        const allowed = new Set(
          serials
            .filter((s) => s.warehouse_id === next.warehouse_id)
            .map((s) => s.id),
        );
        nextLines = prev.lines.map((l) => ({
          ...l,
          serial_ids: l.serial_ids.filter((id) => allowed.has(id)),
        }));
      }
      const toWarehouse =
        docType === "T" && next.to_warehouse_id !== next.warehouse_id
          ? next.to_warehouse_id
          : null;
      return {
        ...prev,
        ...next,
        to_warehouse_id: toWarehouse,
        lines: nextLines,
      };
    });
  }

  function onLinesChange(next: DraftLine[]) {
    setDoc((prev) => {
      if (docType !== "A") return { ...prev, lines: next };
      // 盤點調整：文字欄是「調整原因」，選品項時不帶入品名。
      const prevByKey = new Map(prev.lines.map((l) => [l.key, l]));
      return {
        ...prev,
        lines: next.map((l) => {
          const old = prevByKey.get(l.key);
          return old && old.item_id !== l.item_id && l.line_type === "item"
            ? { ...l, description: "" }
            : l;
        }),
      };
    });
  }

  function submit(post: boolean) {
    setError(null);
    if (
      post &&
      !window.confirm("確定儲存並過帳？過帳後將異動庫存，只能以作廢沖回。")
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const saved = await saveAction(doc);
        if (!saved.ok) {
          setError(saved.error);
          return;
        }
        const id = saved.data.id;
        // 之後再存改為更新同一張草稿（避免過帳失敗後重存產生重複草稿）。
        setDoc((prev) => ({ ...prev, id }));
        if (post) {
          const posted = await postAction(id);
          if (!posted.ok) {
            setError(`草稿已儲存，但過帳失敗：${posted.error}`);
            return;
          }
        }
        router.push(`${basePath}/${id}`);
        router.refresh();
      } catch (e) {
        unstable_rethrow(e);
        setError((e as Error)?.message || "操作失敗，請確認網路後再試一次。");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-text-muted text-[13px]">{HINT[docType]}</p>
      <section className="border-border rounded-xl border bg-white p-4">
        <DocumentHeaderFields
          value={header}
          onChange={onHeaderChange}
          warehouses={warehouses}
          disabled={pending}
        />
      </section>
      <DocumentLinesEditor
        value={lines}
        onChange={onLinesChange}
        items={items}
        serials={warehouseSerials}
        serialMode={docType === "A" ? "signed" : "existing"}
        priceField={null}
        taxType="exempt"
        taxRate={0}
        showPrices={false}
        allowNegativeQty={docType === "A"}
        allowedLineTypes={["item", "note"]}
        descriptionLabel={docType === "A" ? "調整原因（必填）" : "品名規格"}
        disabled={pending}
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(false)}
          className={`${SECONDARY_LINK} disabled:opacity-60`}
        >
          {pending ? "處理中…" : "儲存草稿"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className={`${PRIMARY_LINK} disabled:opacity-60`}
        >
          儲存並過帳
        </button>
        <Link
          href={doc.id ? `${basePath}/${doc.id}` : basePath}
          className="text-text-muted hover:text-ink inline-flex h-10 items-center px-3 text-[14px]"
        >
          取消
        </Link>
      </div>
    </div>
  );
}
