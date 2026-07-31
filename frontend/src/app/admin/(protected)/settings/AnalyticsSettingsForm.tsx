"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveAnalyticsConfig, type SettingsState } from "./actions";

/**
 * GA4 / Google Search Console 設定表單。值非機密（公開注入頁面），故以一般文字輸入，
 * 留空即代表停用對應功能。沿用 AiSettingsForm 的 useActionState 結構。
 */
export function AnalyticsSettingsForm({
  ga4Id,
  gscVerification,
  ga4PropertyId,
  gscSiteUrl,
}: {
  ga4Id: string;
  gscVerification: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveAnalyticsConfig,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ga4_id" className="text-ink text-[14px] font-medium">
          GA4 評估 ID（Measurement ID）
        </label>
        <input
          id="ga4_id"
          name="ga4_id"
          defaultValue={ga4Id}
          autoComplete="off"
          placeholder="G-XXXXXXXXXX"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          填入後，前台會載入 Google Analytics
          4（gtag.js）。留空則完全不載入追蹤腳本。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="gsc_verification"
          className="text-ink text-[14px] font-medium"
        >
          Search Console 驗證碼
        </label>
        <input
          id="gsc_verification"
          name="gsc_verification"
          defaultValue={gscVerification}
          autoComplete="off"
          placeholder="HTML 標籤驗證的 content 值"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          於 Google Search Console
          選「HTML標記」驗證，貼上其中的內容字串；前台會輸出對應的驗證
          meta。Sitemap 請於 GSC 主控台提交 /sitemap.xml。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="ga4_property_id"
          className="text-ink text-[14px] font-medium"
        >
          GA4 資源 ID（Property ID，純數字）
        </label>
        <input
          id="ga4_property_id"
          name="ga4_property_id"
          defaultValue={ga4PropertyId}
          autoComplete="off"
          placeholder="例：544523300"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          用於後台「流量分析」讀取 GA4 數據。與上方「評估 ID（G-
          開頭）」不同，這是純數字的資源 ID。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="gsc_site_url"
          className="text-ink text-[14px] font-medium"
        >
          Search Console 資源網址
        </label>
        <input
          id="gsc_site_url"
          name="gsc_site_url"
          defaultValue={gscSiteUrl}
          autoComplete="off"
          placeholder="例：sc-domain:airexpert.com.tw"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          網域資源填 <code>sc-domain:網域</code>
          ；網址前置字元資源填完整網址（含結尾斜線）。
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-[14px] text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-primary-deep text-[14px]">已儲存 ✓</p>
      ) : null}

      <div>
        <SubmitButton>儲存設定</SubmitButton>
      </div>
    </form>
  );
}
