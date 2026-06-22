import { requireAdmin } from "@/lib/admin/auth";
import { getAiConfig } from "@/lib/ai/gemini";
import { getAiPromptsWithSource } from "@/lib/ai/prompts-server";
import { getContactNotifyConfig } from "@/lib/notify/contact-notify";
import { getAnalytics } from "@/lib/data/site";
import { AiSettingsForm } from "./AiSettingsForm";
import { AiPromptsForm } from "./AiPromptsForm";
import { NotifySettingsForm } from "./NotifySettingsForm";
import { AnalyticsSettingsForm } from "./AnalyticsSettingsForm";

export const metadata = { title: "網站設定" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const cfg = await getAiConfig();
  const prompts = await getAiPromptsWithSource();
  const notifyCfg = await getContactNotifyConfig();
  const analytics = await getAnalytics();

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="text-ink text-[24px] font-bold">網站設定</h1>
      <p className="text-text-muted mt-1 text-[15px]">
        AI 內容生成所需的 Gemini 設定。金鑰加密儲存，僅 server 端使用。
      </p>

      <section className="border-border mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-ink mb-4 text-[17px] font-semibold">
          AI（Gemini）
        </h2>
        <AiSettingsForm
          hasKey={cfg.hasDbKey}
          model={cfg.model}
          source={cfg.source}
        />
      </section>

      <section className="border-border mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-ink mb-1 text-[17px] font-semibold">
          AI Prompt 設定
        </h2>
        <p className="text-text-muted mb-4 text-[14px]">
          編輯「AI 修文」與「一鍵填 SEO」所用的指示
          prompt。內建第一版，可隨時調整或清空還原。
        </p>
        <AiPromptsForm effective={prompts.effective} source={prompts.source} />
      </section>

      <section className="border-border mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-ink mb-1 text-[17px] font-semibold">
          聯絡通知（Email + LINE）
        </h2>
        <p className="text-text-muted mb-4 text-[14px]">
          聯絡表單送出後，會寄 Email 並推播 LINE
          給以下設定的收件人。通知失敗不影響訪客送出。
        </p>
        <NotifySettingsForm config={notifyCfg} />
      </section>

      <section className="border-border mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-ink mb-1 text-[17px] font-semibold">
          分析與索引（GA4 / Search Console）
        </h2>
        <p className="text-text-muted mb-4 text-[14px]">
          設定 Google Analytics 4 與 Google Search Console
          網站驗證。值為公開設定，留空即停用對應功能。
        </p>
        <AnalyticsSettingsForm
          ga4Id={analytics.ga4Id ?? ""}
          gscVerification={analytics.gscVerification ?? ""}
        />
      </section>
    </div>
  );
}
