import type { ContentStatus } from "@/lib/types";

const STYLES: Record<ContentStatus, { label: string; className: string }> = {
  published: { label: "已發佈", className: "bg-primary/10 text-primary-deep" },
  draft: { label: "草稿", className: "bg-amber-100 text-amber-700" },
  archived: { label: "已封存", className: "bg-gray-100 text-gray-500" },
};

export function StatusBadge({ status }: { status: ContentStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${s.className}`}
    >
      {s.label}
    </span>
  );
}
