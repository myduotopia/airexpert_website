"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { generateNewsDraft } from "@/lib/ai/gemini";
import { NEWS_CATEGORIES } from "@/components/news/constants";

export type GenState = { error?: string };

export async function generateNewsDraftAction(
  _prev: GenState,
  fd: FormData,
): Promise<GenState> {
  await requireAdmin();
  const topic = String(fd.get("topic") ?? "").trim();
  const category = String(fd.get("category") ?? "").trim();
  if (!topic) return { error: "請輸入文章主題或關鍵字" };
  if (!(NEWS_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "分類無效" };
  }

  let draft, model;
  try {
    ({ draft, model } = await generateNewsDraft(topic, category));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const { data, error } = await getAdminSupabase()
    .from("ai_content_drafts")
    .insert({
      target_type: "article",
      kind: "body",
      prompt: topic,
      model,
      output: JSON.stringify({ ...draft, category }),
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // 帶著草稿 id 跳到「新增文章」表單預填，讓 admin 審稿後再存。
  redirect(`/admin/news/new?draft=${data.id}`);
}
