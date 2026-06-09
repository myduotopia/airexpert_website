// 聯絡表單送出（client-safe）。
//
// 刻意與 data.ts 分開：data.ts 的讀取用 `unstable_cache`（server-only），
// 而聯絡表單由 client component 直接以 anon key 送出，故不可引入任何 server-only 相依。
//
// CRITICAL: 不可串接 `.select()`。anon 對 contact_submissions 只有 insert policy、
// 沒有 select policy；若串 `.select()` 會觸發讀取而回 401。insert 採 return=minimal 語意。

import { getSupabaseClient } from "./supabase";
import type { ContactSubmissionInput } from "./types";

export async function submitContactForm(
  payload: ContactSubmissionInput,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("contact_submissions")
    .insert(payload);

  if (error) {
    throw new Error(`Contact form submission failed: ${error.message}`);
  }
}
