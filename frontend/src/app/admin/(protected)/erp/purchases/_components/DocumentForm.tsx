"use client";

// 採購區單據表單（P / I / PR 共用）：表頭 + 明細，受控；「儲存草稿」與「儲存並過帳」。
// 錯誤就地顯示並保留輸入（spec §9）；成功後導向明細頁。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { DocumentHeaderFields } from "@/components/erp/DocumentHeaderFields";
import {
  DocumentLinesEditor,
  type SerialMode,
} from "@/components/erp/DocumentLinesEditor";
import type {
  DraftDocument,
  DraftDocumentHeader,
  ItemOption,
  SerialOption,
  VendorOption,
  WarehouseOption,
} from "@/lib/erp/types";

type SaveResult = { ok: true; id: string } | { ok: false; error: string };
type DocActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export function DocumentForm({
  initial,
  basePath,
  vendors,
  warehouses,
  items,
  serials = [],
  serialMode = "none",
  sourceLabel,
  saveAction,
  postAction,
}: {
  initial: DraftDocument;
  basePath: string;
  vendors: VendorOption[];
  warehouses: WarehouseOption[];
  items: ItemOption[];
  serials?: SerialOption[];
  serialMode?: SerialMode;
  /** 來源單據說明（例：「由採購單 P11509008 轉入」）。 */
  sourceLabel?: string | null;
  saveAction: (input: DraftDocument) => Promise<SaveResult>;
  postAction: (id: string) => Promise<DocActionResult>;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DraftDocument>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { lines, ...header } = doc;

  // 既有機號只列出表頭倉庫中的（PR 出庫須在該倉）。
  const visibleSerials = useMemo(
    () =>
      doc.warehouse_id
        ? serials.filter((s) => s.warehouse_id === doc.warehouse_id)
        : serials,
    [serials, doc.warehouse_id],
  );

  function submit(andPost: boolean) {
    setError(null);
    if (
      andPost &&
      !window.confirm(
        "確定儲存並過帳？過帳後將取號並異動庫存，只能以作廢撤銷。",
      )
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
        // 之後再存為更新同一張草稿（新增頁過帳失敗時也不會重複建單）。
        setDoc((d) => ({ ...d, id: saved.id }));
        if (andPost) {
          const posted = await postAction(saved.id);
          if (!posted.ok) {
            setError(`草稿已儲存，但過帳失敗：${posted.error}`);
            return;
          }
        }
        router.push(`${basePath}/${saved.id}`);
        router.refresh();
      } catch (e) {
        unstable_rethrow(e);
        setError((e as Error)?.message || "操作失敗，請確認網路後再試一次。");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {sourceLabel && (
        <p className="bg-primary/5 text-primary-deep rounded-lg px-3 py-2 text-[13px]">
          {sourceLabel}
        </p>
      )}
      <section className="border-border rounded-xl border bg-white p-4">
        <DocumentHeaderFields
          value={header}
          onChange={(h: DraftDocumentHeader) => setDoc({ ...h, lines })}
          vendors={vendors}
          warehouses={warehouses}
          disabled={pending}
        />
      </section>
      <section>
        <h2 className="text-ink mb-2 text-[16px] font-semibold">明細</h2>
        <DocumentLinesEditor
          value={lines}
          onChange={(next) => setDoc({ ...header, lines: next })}
          items={items}
          serials={visibleSerials}
          serialMode={serialMode}
          priceField="purchase_price"
          taxType={doc.tax_type}
          taxRate={doc.tax_rate}
          currency={doc.currency}
          exchangeRate={doc.exchange_rate}
          disabled={pending}
        />
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={doc.id ? `${basePath}/${doc.id}` : basePath}
          className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold"
        >
          取消
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(false)}
          className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold disabled:opacity-60"
        >
          {pending ? "處理中…" : "儲存草稿"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          儲存並過帳
        </button>
      </div>
    </div>
  );
}
