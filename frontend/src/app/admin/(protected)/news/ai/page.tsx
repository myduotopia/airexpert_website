"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NEWS_CATEGORIES } from "@/components/news/constants";
import { generateNewsDraftAction, type GenState } from "./actions";

export default function NewsAiPage() {
  const [state, formAction] = useActionState<GenState, FormData>(
    generateNewsDraftAction,
    {},
  );

  return (
    <div className="mx-auto max-w-[640px]">
      <Link
        href="/admin/news"
        className="text-text-muted text-[13px] hover:underline"
      >
        ← 返回最新消息
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">
        ✨ AI 生成文章草稿
      </h1>
      <p className="text-text-muted mt-1 text-[15px]">
        輸入主題與分類，由 Gemini 生成文章與 SEO
        欄位草稿；生成後會帶你到「新增文章」表單審稿、可再編輯後才發佈。
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="topic" className="text-ink text-[14px] font-medium">
            主題 / 關鍵字
          </label>
          <textarea
            id="topic"
            name="topic"
            rows={3}
            required
            placeholder="例：變頻空壓機如何幫工廠省電？選型重點與節能補助"
            className="border-border focus:border-primary rounded-lg border px-3 py-2 text-[15px] outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="category"
            className="text-ink text-[14px] font-medium"
          >
            分類
          </label>
          <select
            id="category"
            name="category"
            defaultValue={NEWS_CATEGORIES[0]}
            className="border-border focus:border-primary h-11 rounded-lg border bg-white px-3 text-[15px] outline-none"
          >
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {state.error ? (
          <p role="alert" className="text-[14px] text-red-600">
            {state.error}
          </p>
        ) : null}

        <div>
          <SubmitButton pendingText="生成中…（約數秒）">生成草稿</SubmitButton>
        </div>
      </form>
    </div>
  );
}
