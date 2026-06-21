"use server";

// 聯絡表單送出（server action）— 寫入 contact_submissions 後，觸發 Email + LINE 通知。
//
// 為何改用 server action（原 lib/contact.ts 為 client anon insert）：
// 通知需讀取加密機密（Resend key / LINE token），只能在 server 端進行；
// 故把「insert + 通知」收斂到 server action，機密絕不外送瀏覽器。
//
// 失敗隔離（issue #59 要求）：通知失敗「不得」讓使用者看到送出失敗。
// notifyContactSubmission 內部已對每管道 try/catch 且不丟錯；此處再以 try/catch
// 包一層作為縱深防禦，確保 insert 成功即回 ok。
import { getAdminSupabase } from "@/lib/supabase-admin";
import { notifyContactSubmission } from "@/lib/notify/contact-notify";
import type { ContactSubmissionInput } from "@/lib/types";

export type SubmitContactResult = { ok: true } | { ok: false; error: string };

function clean(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
}

export async function submitContactAction(
  input: ContactSubmissionInput,
): Promise<SubmitContactResult> {
  const payload: ContactSubmissionInput = {
    name: clean(input.name),
    company: clean(input.company),
    phone: clean(input.phone),
    email: clean(input.email),
    message: clean(input.message),
    source_page: clean(input.source_page) ?? "/contact",
  };

  // 基本必填驗證（與前端一致：姓名 + 留言 + 至少一種聯絡方式）。
  if (!payload.name || !payload.message || (!payload.phone && !payload.email)) {
    return { ok: false, error: "缺少必填欄位。" };
  }

  const { error } = await getAdminSupabase()
    .from("contact_submissions")
    .insert(payload);

  if (error) {
    return { ok: false, error: `送出失敗：${error.message}` };
  }

  // insert 成功 → 觸發通知。通知失敗一律吞掉並記錄，不影響送出結果。
  try {
    const result = await notifyContactSubmission(payload);
    if (!result.email.ok || !result.line.ok) {
      console.error("[contact-notify] 部分通知失敗", {
        email: result.email,
        line: result.line,
      });
    }
  } catch (e) {
    console.error("[contact-notify] 通知流程例外", e);
  }

  return { ok: true };
}
