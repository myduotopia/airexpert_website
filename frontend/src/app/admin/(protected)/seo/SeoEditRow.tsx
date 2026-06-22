"use client";

import { useState, useTransition } from "react";
import { SeoFields } from "@/components/admin/SeoFields";
import { AiFillSeoButton } from "@/components/admin/ai/AiFillSeoButton";
import type { AiTargetType } from "@/lib/ai/actions";
import type { SeoRow, SeoTable } from "@/lib/admin/seo-overview";
import { updateContentSeo } from "./actions";

// 單列 SEO 快速編輯（行內展開）。僅編 SEO meta，無內文 / status / slug 編輯。
// 共用 <SeoFields>（defaultOpen）與 <AiFillSeoButton>；AiFillSeoButton 以 DOM 讀同 form 的
// name="title"（隱藏欄位帶入本列標題），把 AI 建議填入下方 SeoFields 欄位。
// 送出走 updateContentSeo(table, id, formData)：server 端 requireRole + allowlist + pickSeoWritable。

/** table → AI 草稿 target_type（ai_content_drafts 稽核用）。 */
const AI_TARGET: Record<SeoTable, AiTargetType> = {
  products: "product",
  articles: "article",
  services: "service",
  cases: "case",
  photo_albums: "album",
};

export function SeoEditRow({
  row,
  onSaved,
}: {
  row: SeoRow;
  onSaved?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateContentSeo(row.table, row.id, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      onSaved?.();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* AiFillSeoButton 以 DOM 讀取同表單的 name="title" 作為標題來源（總覽無內文）。 */}
      <input type="hidden" name="title" value={row.title} />

      <AiFillSeoButton targetType={AI_TARGET[row.table]} targetId={row.id} />

      <SeoFields values={row} defaultOpen />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "儲存中…" : "儲存 SEO"}
        </button>
        {error ? (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-primary-deep text-[13px]">已儲存 ✓</p>
        ) : null}
      </div>
    </form>
  );
}
