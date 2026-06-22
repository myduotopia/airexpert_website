// Next.js 16 Proxy（前身為 Middleware）：兩項職責
//   1) 舊站 .html → 新路由的 301/302 轉址（查 DB redirects 表，see lib/redirects）。
//   2) 在 /admin/* 路由刷新 Supabase session cookie，讓 server component / server action
//      讀得到最新登入狀態（optimistic；真正授權檢查在 (protected)/layout 的 requireAdmin）。
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getRedirectMap } from "@/lib/redirects/load";
import { matchRedirect, shouldCheckRedirect } from "@/lib/redirects/match";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- (1) 轉址：先於 admin cookie 刷新處理，命中即直接 redirect ---
  // 效能護欄：跳過 _next 資產 / api / 一般靜態檔（.html 例外）→ 不查 DB。
  if (shouldCheckRedirect(pathname)) {
    const map = await getRedirectMap();
    const hit = matchRedirect(pathname, map);
    if (hit) {
      // 站內路徑解析為絕對 URL（保留 host）；完整 URL 直接採用。
      const destination = hit.to.startsWith("http")
        ? hit.to
        : new URL(hit.to, request.url);
      return NextResponse.redirect(destination, hit.status);
    }
  }

  // --- (2) admin session cookie 刷新（僅 /admin/*）---
  let response = NextResponse.next({ request });
  if (!pathname.startsWith("/admin")) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // 觸發 token 刷新並回寫 cookie。
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 全站皆過 proxy（轉址需要），但排除 Next 內部資產與帶副檔名的靜態檔
  // （.html 例外 —— 舊站正是 .html，需進入比對）。shouldCheckRedirect 再做細部護欄。
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
