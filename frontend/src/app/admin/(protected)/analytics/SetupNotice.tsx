import Link from "next/link";

/** 未設定 / 錯誤時的引導卡片。 */
export function SetupNotice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-surface-muted rounded-xl border border-dashed p-6">
      <p className="text-ink text-[15px] font-semibold">{title}</p>
      <div className="text-text-muted mt-1 text-[13px]">{children}</div>
      <Link
        href="/admin/settings"
        className="text-primary-deep mt-3 inline-block text-[13px] underline"
      >
        前往網站設定 →
      </Link>
    </div>
  );
}
