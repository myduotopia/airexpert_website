"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 表單 server action 成功（回傳 { ok: true }）後，於 client 端導回列表。
 * 取代「在 server action 內 redirect」——後者在 revalidateTag + redirect 同一個
 * action 時會卡住導航（known Next.js 行為）。
 *
 * 依賴整個 state 物件的 identity（每次送出 action 都回傳全新物件），而非 ok 布林值——
 * 否則「停在同一個已掛載表單再次儲存」時 ok 仍是 true、effect 不會重觸發而漏導航。
 */
export function useNavigateOnSuccess(state: { ok?: boolean }, href: string) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.push(href);
  }, [state, href, router]);
}
