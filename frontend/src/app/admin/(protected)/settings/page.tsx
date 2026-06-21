import { requireAdmin } from "@/lib/admin/auth";
import { getAiConfig } from "@/lib/ai/gemini";
import { getContactNotifyConfig } from "@/lib/notify/contact-notify";
import { AiSettingsForm } from "./AiSettingsForm";
import { NotifySettingsForm } from "./NotifySettingsForm";

export const metadata = { title: "網站設定" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const cfg = await getAiConfig();
  const notifyCfg = await getContactNotifyConfig();

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
          聯絡通知（Email + LINE）
        </h2>
        <p className="text-text-muted mb-4 text-[14px]">
          聯絡表單送出後，會寄 Email 並推播 LINE
          給以下設定的收件人。通知失敗不影響訪客送出。
        </p>
        <NotifySettingsForm config={notifyCfg} />
      </section>
    </div>
  );
}
