// 依權限顯示連結或純文字（#283）。無 hooks，server / client component 皆可直接使用。
// allowed 由 server 頁面以 hasMaintenanceAccess() / hasModule() 算好後傳入（布林值，可跨 RSC 邊界）。
// 沒有權限：children 照常顯示但不可點；hint 為 true 時另加小字「需保養卡權限」
// （用在整個連結／按鈕本身就是唯一內容、拿掉後使用者會不知道為什麼的地方）；
// fallback 則整個取代 children（例：「進入保養卡」按鈕改成只顯示提示）。
import type { ReactNode } from "react";
import Link from "next/link";
import { MAINTENANCE_PERMISSION_HINT } from "@/lib/erp/admin-links";

export function PermissionHint({ text = MAINTENANCE_PERMISSION_HINT }) {
  return (
    <span className="text-text-muted text-[12px] font-normal">（{text}）</span>
  );
}

export function GatedLink({
  href,
  allowed,
  className,
  plainClassName,
  title,
  hint = false,
  fallback,
  children,
}: {
  href: string;
  allowed: boolean;
  className?: string;
  /** 沒有權限時純文字的樣式（預設無）。 */
  plainClassName?: string;
  title?: string;
  /** 沒有權限時是否加上「需保養卡權限」提示。 */
  hint?: boolean;
  /** 沒有權限時整個取代 children 的內容（給了就不另加 hint）。 */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  if (allowed) {
    return (
      <Link href={href} className={className} title={title}>
        {children}
      </Link>
    );
  }
  if (fallback !== undefined) return <>{fallback}</>;
  return (
    <>
      <span className={plainClassName}>{children}</span>
      {hint && (
        <>
          {" "}
          <PermissionHint />
        </>
      )}
    </>
  );
}
