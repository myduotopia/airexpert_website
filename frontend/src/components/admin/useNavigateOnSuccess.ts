"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 表單 server action 成功（回傳 { ok: true }）後，於 client 端導回列表。
 * 取代「在 server action 內 redirect」——後者在 revalidateTag + redirect 同一個
 * action 時會卡住導航（known Next.js 行為）。
 */
export function useNavigateOnSuccess(ok: boolean | undefined, href: string) {
  const router = useRouter();
  useEffect(() => {
    if (ok) router.push(href);
  }, [ok, href, router]);
}
