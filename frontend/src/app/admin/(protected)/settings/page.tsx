import { requireAdmin } from "@/lib/admin/auth";
import { getAiConfig } from "@/lib/ai/gemini";
import { AiSettingsForm } from "./AiSettingsForm";

export const metadata = { title: "網站設定" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const cfg = await getAiConfig();

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
    </div>
  );
}
