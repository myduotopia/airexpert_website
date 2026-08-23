// 服務類型 badge（例檢／保養／維修）。無 hooks，可在 server component 直接使用。
import {
  SERVICE_TYPE_BADGE_CLASSES,
  SERVICE_TYPE_LABELS,
  type ServiceType,
} from "@/lib/admin/maintenance-service-type";

export function ServiceTypeBadge({ type }: { type: ServiceType | null }) {
  // 未判定：以淡色「未判定」呈現，提醒人工補。
  const className = type
    ? SERVICE_TYPE_BADGE_CLASSES[type]
    : "bg-gray-100 text-gray-500";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${className}`}
    >
      {type ? SERVICE_TYPE_LABELS[type] : "未判定"}
    </span>
  );
}
