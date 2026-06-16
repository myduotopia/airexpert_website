"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// 公開站殼層（Header/Footer/FloatingSocial）只套在前台路由；/admin/* 改用後台自己的殼層。
// root layout 是 server component，故把已渲染的 chrome 以 props 傳入此 client 包裝器，
// 由它依 pathname 決定是否顯示（避免把 server component 直接 import 進 client）。
export function SiteChrome({
  header,
  footer,
  social,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  social: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      {header}
      <main className="flex-1">{children}</main>
      {footer}
      {social}
    </>
  );
}
